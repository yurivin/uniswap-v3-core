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

describe('SwapReferrer Advanced Tests', () => {
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
  })

  describe('Swap Referrer with Liquidity', () => {
    beforeEach(async () => {
      // Setup for actual swaps
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeSwapReferrer(10, 10) // 10% of remaining fees after protocol
    })

    it('successfully executes swapWithReferrer and transfers fees', async () => {
      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10), // 0.1 tokens
        sqrtPriceLimitX96: encodePriceSqrt(1, 2), // Move price significantly
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const tx = await swapTargetRouter.swapWithReferrer(pool.address, args)
      await expect(tx)
        .to.emit(pool, 'Swap')
        .to.emit(pool, 'SwapReferrerFeeTransfer')

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.be.gt(referrerBalanceBefore)
    })

    it('processes fees correctly in both directions', async () => {
      const referrerBalance0Before = await token0.balanceOf(referrer.address)
      const referrerBalance1Before = await token1.balanceOf(referrer.address)

      // Swap token0 for token1
      const args0for1 = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt1 = await (await swapTargetRouter.swapWithReferrer(pool.address, args0for1)).wait()

      const referrerBalance0After1 = await token0.balanceOf(referrer.address)
      const referrerBalance1After1 = await token1.balanceOf(referrer.address)

      expect(referrerBalance0After1).to.be.gt(referrerBalance0Before)
      expect(referrerBalance1After1).to.eq(referrerBalance1Before)

      // Check event details
      const swapReferrerFeeEvents1 = receipt1.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents1.length).to.eq(1)
      expect(swapReferrerFeeEvents1[0].args?.referrer).to.eq(referrer.address)
      expect(swapReferrerFeeEvents1[0].args?.amount0).to.be.gt(0)
      expect(swapReferrerFeeEvents1[0].args?.amount1).to.eq(0)

      // Swap token1 for token0
      const args1for0 = {
        recipient: wallet.address,
        zeroForOne: false,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(2, 1),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt2 = await (await swapTargetRouter.swapWithReferrer(pool.address, args1for0)).wait()

      const referrerBalance0After2 = await token0.balanceOf(referrer.address)
      const referrerBalance1After2 = await token1.balanceOf(referrer.address)

      expect(referrerBalance0After2).to.eq(referrerBalance0After1)
      expect(referrerBalance1After2).to.be.gt(referrerBalance1After1)

      // Check event details
      const swapReferrerFeeEvents2 = receipt2.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents2.length).to.eq(1)
      expect(swapReferrerFeeEvents2[0].args?.referrer).to.eq(referrer.address)
      expect(swapReferrerFeeEvents2[0].args?.amount0).to.eq(0)
      expect(swapReferrerFeeEvents2[0].args?.amount1).to.be.gt(0)
    })

    it('respects router whitelist - no fees for non-whitelisted router', async () => {
      // Remove router from whitelist
      await factory.removeRouterFromWhitelist(swapTargetRouter.address)

      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)

      // Should not emit SwapReferrerFeeTransfer event
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(0)
    })
  })

  describe('Fee Distribution with Protocol Fees', () => {
    beforeEach(async () => {
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeProtocol(4, 4) // 25% protocol fee (1/4)
      await pool.setFeeSwapReferrer(5, 5) // 20% of remaining (1/5)
    })

    it('distributes fees in correct hierarchy: protocol -> referrer -> LPs', async () => {
      const protocolFeesBefore = await pool.protocolFees()
      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(2), // Large swap for significant fees
        sqrtPriceLimitX96: encodePriceSqrt(1, 4), // Move price significantly for more fees
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()
      
      const protocolFeesAfter = await pool.protocolFees()
      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      
      // Protocol fees should have increased
      expect(protocolFeesAfter.token0).to.be.gt(protocolFeesBefore.token0)
      
      // Referrer should have received fees
      expect(referrerBalanceAfter).to.be.gt(referrerBalanceBefore)
      
      // Verify event was emitted with correct amounts
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(1)
      expect(swapReferrerFeeEvents[0].args?.referrer).to.eq(referrer.address)
      expect(swapReferrerFeeEvents[0].args?.amount0).to.be.gt(0)
      expect(swapReferrerFeeEvents[0].args?.amount1).to.eq(0)

      // Verify the actual amounts transferred match the event
      const referrerFeesReceived = referrerBalanceAfter.sub(referrerBalanceBefore)
      expect(referrerFeesReceived).to.eq(swapReferrerFeeEvents[0].args?.amount0)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeSwapReferrer(10, 10)
    })

    it('handles zero referrer address gracefully', async () => {
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: ethers.constants.AddressZero,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()

      // Should not emit SwapReferrerFeeTransfer event
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(0)
    })

    it('handles zero referrer fee configuration', async () => {
      await pool.setFeeSwapReferrer(0, 0) // Turn off referrer fees

      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)

      // Should not emit SwapReferrerFeeTransfer event
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(0)
    })
  })

  describe('Backwards Compatibility', () => {
    it('original swap function works unchanged', async () => {
      await expect(
        poolFunctions.swapExact0For1(expandTo18Decimals(1).div(10), wallet.address)
      ).to.emit(pool, 'Swap')
    })

    it('original swap does not trigger referrer fees', async () => {
      await pool.setFeeSwapReferrer(10, 10)
      
      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      await poolFunctions.swapExact0For1(expandTo18Decimals(1).div(10), wallet.address)
      
      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)
    })
  })
})