import { ethers, waffle } from 'hardhat'
import { expect } from './shared/expect'
import { poolFixture } from './shared/fixtures'
import { FeeAmount, TICK_SPACINGS, createPoolFunctions, encodePriceSqrt, expandTo18Decimals } from './shared/utilities'
import { MockTimeUniswapV3Pool } from '../typechain/MockTimeUniswapV3Pool'
import { TestERC20 } from '../typechain/TestERC20'
import { UniswapV3Factory } from '../typechain/UniswapV3Factory'
import { TestUniswapV3Callee } from '../typechain/TestUniswapV3Callee'
import { TestUniswapV3Router } from '../typechain/TestUniswapV3Router'
import { BigNumber } from 'ethers'

const createFixtureLoader = waffle.createFixtureLoader

describe('SwapReferrer Final Tests', () => {
  let wallet: any, other: any, referrer: any
  let token0: TestERC20
  let token1: TestERC20
  let factory: UniswapV3Factory
  let pool: MockTimeUniswapV3Pool
  let swapTargetCallee: TestUniswapV3Callee
  let swapTargetRouter: TestUniswapV3Router

  let loadFixture: ReturnType<typeof createFixtureLoader>
  let poolFunctions: any

  before('create fixture loader', async () => {
    const signers = await ethers.getSigners()
    wallet = signers[0]
    other = signers[1]
    referrer = signers[2]

    loadFixture = createFixtureLoader([wallet, other])
  })

  beforeEach('load fixture', async () => {
    const fixture = await loadFixture(poolFixture)
    token0 = fixture.token0
    token1 = fixture.token1
    factory = fixture.factory
    swapTargetCallee = fixture.swapTargetCallee
    swapTargetRouter = fixture.swapTargetRouter
    
    pool = await fixture.createPool(FeeAmount.MEDIUM, TICK_SPACINGS[FeeAmount.MEDIUM])

    // Use createPoolFunctions for proper test setup
    poolFunctions = createPoolFunctions({
      swapTarget: swapTargetCallee,
      token0,
      token1,
      pool
    })

    await pool.initialize(encodePriceSqrt(1, 1))
    
    // Add liquidity using the proper utility function
    await poolFunctions.mint(wallet.address, -TICK_SPACINGS[FeeAmount.MEDIUM] * 100, TICK_SPACINGS[FeeAmount.MEDIUM] * 100, expandTo18Decimals(2))

    // Give tokens to test contracts and approve them to spend wallet's tokens
    const amount = expandTo18Decimals(100)
    
    // Transfer tokens to test contracts
    await token0.transfer(swapTargetCallee.address, amount)
    await token1.transfer(swapTargetCallee.address, amount)
    await token0.transfer(swapTargetRouter.address, amount)
    await token1.transfer(swapTargetRouter.address, amount)
    
    // CRITICAL: Approve test contracts to spend wallet's tokens (for transferFrom in callback)
    await token0.approve(swapTargetCallee.address, amount)
    await token1.approve(swapTargetCallee.address, amount)
    await token0.approve(swapTargetRouter.address, amount)
    await token1.approve(swapTargetRouter.address, amount)
  })

  describe('swapWithReferrer Functionality', () => {
    it('executes swap without referrer fees', async () => {
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(100),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: ethers.constants.AddressZero,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await expect(swapTargetCallee.swapWithReferrer(pool.address, args))
        .to.emit(pool, 'Swap')
    })

    it('executes swap with referrer fees when router whitelisted', async () => {
      // Setup referrer fees and whitelist
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeSwapReferrer(8, 8) // 1/8 = 12.5% of remaining fees

      const referrerBalanceBefore = await token0.balanceOf(referrer.address)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10), // Larger amount for visible fees
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const tx = await swapTargetRouter.swapWithReferrer(pool.address, args)
      await expect(tx)
        .to.emit(pool, 'Swap')
        .to.emit(pool, 'SwapReferrerFeeTransfer')

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.be.gt(referrerBalanceBefore)

      console.log('Referrer received fees:', referrerBalanceAfter.sub(referrerBalanceBefore).toString())
    })

    it('does not transfer fees when router not whitelisted', async () => {
      await pool.setFeeSwapReferrer(8, 8)

      const referrerBalanceBefore = await token0.balanceOf(referrer.address)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetCallee.swapWithReferrer(pool.address, args)).wait()

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)

      // Should not emit SwapReferrerFeeTransfer event
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(0)
    })
  })

  describe('Fee Distribution Tests', () => {
    beforeEach(async () => {
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeProtocol(4, 4) // 25% protocol fee
      await pool.setFeeSwapReferrer(5, 5) // 20% of remaining (after protocol)
    })

    it('distributes fees correctly in hierarchy', async () => {
      const protocolFeesBefore = await pool.protocolFees()
      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(2), // Large swap for significant fees
        sqrtPriceLimitX96: encodePriceSqrt(1, 4),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()
      
      const protocolFeesAfter = await pool.protocolFees()
      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      
      // Protocol fees should increase
      const protocolFeesEarned = protocolFeesAfter.token0.sub(protocolFeesBefore.token0)
      expect(protocolFeesEarned).to.be.gt(0)
      
      // Referrer should receive fees  
      const referrerFeesEarned = referrerBalanceAfter.sub(referrerBalanceBefore)
      expect(referrerFeesEarned).to.be.gt(0)
      
      // Verify event
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(1)
      expect(swapReferrerFeeEvents[0].args?.referrer).to.eq(referrer.address)
      expect(swapReferrerFeeEvents[0].args?.amount0).to.eq(referrerFeesEarned)
      expect(swapReferrerFeeEvents[0].args?.amount1).to.eq(0)

      console.log('Protocol fees earned:', protocolFeesEarned.toString())
      console.log('Referrer fees earned:', referrerFeesEarned.toString())
    })

    it('handles both token directions', async () => {
      // Token0 -> Token1 swap
      const referrerBalance0Before = await token0.balanceOf(referrer.address)
      
      const args0for1 = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt1 = await (await swapTargetRouter.swapWithReferrer(pool.address, args0for1)).wait()
      
      const referrerBalance0After = await token0.balanceOf(referrer.address)
      expect(referrerBalance0After).to.be.gt(referrerBalance0Before)

      // Check event for token0 fees
      const events1 = receipt1.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(events1.length).to.eq(1)
      expect(events1[0].args?.amount0).to.be.gt(0)
      expect(events1[0].args?.amount1).to.eq(0)

      // Token1 -> Token0 swap
      const referrerBalance1Before = await token1.balanceOf(referrer.address)
      
      const args1for0 = {
        recipient: wallet.address,
        zeroForOne: false,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(2, 1),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt2 = await (await swapTargetRouter.swapWithReferrer(pool.address, args1for0)).wait()
      
      const referrerBalance1After = await token1.balanceOf(referrer.address)
      expect(referrerBalance1After).to.be.gt(referrerBalance1Before)

      // Check event for token1 fees
      const events2 = receipt2.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(events2.length).to.eq(1)
      expect(events2[0].args?.amount0).to.eq(0)
      expect(events2[0].args?.amount1).to.be.gt(0)
    })
  })

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await factory.addRouterToWhitelist(swapTargetRouter.address)
    })

    it('handles zero referrer address', async () => {
      await pool.setFeeSwapReferrer(8, 8)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: ethers.constants.AddressZero,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()

      // Should not emit referrer fee event
      const events = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(events.length).to.eq(0)
    })

    it('handles disabled referrer fees', async () => {
      await pool.setFeeSwapReferrer(0, 0) // Disable referrer fees

      const referrerBalanceBefore = await token0.balanceOf(referrer.address)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)

      // Should not emit referrer fee event
      const events = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(events.length).to.eq(0)
    })
  })

  describe('Backwards Compatibility', () => {
    it('original swap function still works', async () => {
      await expect(
        poolFunctions.swapExact0For1(expandTo18Decimals(1).div(100), wallet.address)
      ).to.emit(pool, 'Swap')
    })

    it('original swap unaffected by referrer fee settings', async () => {
      await pool.setFeeSwapReferrer(8, 8)
      
      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      await poolFunctions.swapExact0For1(expandTo18Decimals(1).div(10), wallet.address)
      
      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)
    })
  })
})