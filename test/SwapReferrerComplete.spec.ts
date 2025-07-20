import { ethers, waffle } from 'hardhat'
import { expect } from './shared/expect'
import { poolFixture } from './shared/fixtures'
import { FeeAmount, TICK_SPACINGS, createPoolFunctions, encodePriceSqrt, expandTo18Decimals } from './shared/utilities'
import { MockTimeUniswapV3Pool } from '../typechain/MockTimeUniswapV3Pool'
import { TestERC20 } from '../typechain/TestERC20'
import { UniswapV3Factory } from '../typechain/UniswapV3Factory'
import { TestUniswapV3Callee } from '../typechain/TestUniswapV3Callee'
import { TestUniswapV3Router } from '../typechain/TestUniswapV3Router'

const createFixtureLoader = waffle.createFixtureLoader

describe('SwapReferrer Complete Accumulate-Collect Tests', () => {
  let wallet: any, other: any, referrer1: any, referrer2: any
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
    referrer1 = signers[2]
    referrer2 = signers[3]

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

    poolFunctions = createPoolFunctions({
      swapTarget: swapTargetCallee,
      token0,
      token1,
      pool
    })

    await pool.initialize(encodePriceSqrt(1, 1))
    await poolFunctions.mint(wallet.address, -TICK_SPACINGS[FeeAmount.MEDIUM] * 100, TICK_SPACINGS[FeeAmount.MEDIUM] * 100, expandTo18Decimals(2))

    // Setup for referrer tests
    await factory.addRouterToWhitelist(swapTargetCallee.address)
    await pool.setFeeSwapReferrer(10, 10) // 10% of remaining fees
  })

  describe('Fee Accumulation', () => {
    it('accumulates fees correctly for single referrer', async () => {
      const feesBefore = await pool.referrerFees(referrer1.address)
      expect(feesBefore.token0).to.eq(0)
      expect(feesBefore.token1).to.eq(0)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer1.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args)

      const feesAfter = await pool.referrerFees(referrer1.address)
      expect(feesAfter.token0).to.be.gt(0)
      expect(feesAfter.token1).to.eq(0)

      console.log('Referrer1 accumulated token0 fees:', feesAfter.token0.toString())
    })

    it('accumulates fees for multiple referrers independently', async () => {
      // Referrer1 gets token0 fees
      const args1 = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer1.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args1)

      // Referrer2 gets token1 fees
      const args2 = {
        recipient: wallet.address,
        zeroForOne: false,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(2, 1),
        swapReferrer: referrer2.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args2)

      const fees1 = await pool.referrerFees(referrer1.address)
      const fees2 = await pool.referrerFees(referrer2.address)

      expect(fees1.token0).to.be.gt(0)
      expect(fees1.token1).to.eq(0)
      expect(fees2.token0).to.eq(0)
      expect(fees2.token1).to.be.gt(0)

      console.log('Referrer1 fees (token0):', fees1.token0.toString())
      console.log('Referrer2 fees (token1):', fees2.token1.toString())
    })

    it('accumulates multiple swaps for same referrer', async () => {
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(50),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer1.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      // First swap
      await swapTargetCallee.swapWithReferrer(pool.address, args)
      const feesAfterFirst = await pool.referrerFees(referrer1.address)

      // Second swap
      await swapTargetCallee.swapWithReferrer(pool.address, args)
      const feesAfterSecond = await pool.referrerFees(referrer1.address)

      expect(feesAfterSecond.token0).to.be.gt(feesAfterFirst.token0)
      console.log('Fees after first swap:', feesAfterFirst.token0.toString())
      console.log('Fees after second swap:', feesAfterSecond.token0.toString())
    })
  })

  describe('Fee Collection', () => {
    beforeEach(async () => {
      // Accumulate some fees for referrer1
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(5),
        sqrtPriceLimitX96: encodePriceSqrt(1, 3),
        swapReferrer: referrer1.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args)
    })

    it('allows referrer to collect their fees', async () => {
      const feesBefore = await pool.referrerFees(referrer1.address)
      const balanceBefore = await token0.balanceOf(referrer1.address)

      expect(feesBefore.token0).to.be.gt(0)

      const tx = await pool.connect(referrer1).collectMyReferrerFees()
      await expect(tx)
        .to.emit(pool, 'CollectReferrerFees')
        .withArgs(referrer1.address, feesBefore.token0, 0)

      const feesAfter = await pool.referrerFees(referrer1.address)
      const balanceAfter = await token0.balanceOf(referrer1.address)

      // Fees should be cleared
      expect(feesAfter.token0).to.eq(0)
      expect(feesAfter.token1).to.eq(0)

      // Balance should increase by collected amount
      expect(balanceAfter.sub(balanceBefore)).to.eq(feesBefore.token0)

      console.log('Collected fees:', balanceAfter.sub(balanceBefore).toString())
    })

    it('returns correct amounts from collectMyReferrerFees', async () => {
      const feesBefore = await pool.referrerFees(referrer1.address)

      const result = await pool.connect(referrer1).callStatic.collectMyReferrerFees()
      expect(result.amount0).to.eq(feesBefore.token0)
      expect(result.amount1).to.eq(feesBefore.token1)
    })

    it('handles collection when no fees accumulated', async () => {
      const balanceBefore = await token0.balanceOf(referrer2.address)

      const tx = await pool.connect(referrer2).collectMyReferrerFees()
      await expect(tx)
        .to.emit(pool, 'CollectReferrerFees')
        .withArgs(referrer2.address, 0, 0)

      const balanceAfter = await token0.balanceOf(referrer2.address)
      expect(balanceAfter).to.eq(balanceBefore)
    })

    it('collection is idempotent', async () => {
      const balanceBefore = await token0.balanceOf(referrer1.address)

      // First collection
      await pool.connect(referrer1).collectMyReferrerFees()
      const balanceAfterFirst = await token0.balanceOf(referrer1.address)

      // Second collection should get nothing
      await pool.connect(referrer2).collectMyReferrerFees()
      const balanceAfterSecond = await token0.balanceOf(referrer1.address)

      expect(balanceAfterFirst).to.be.gt(balanceBefore)
      expect(balanceAfterSecond).to.eq(balanceAfterFirst)
    })
  })

  describe('Multi-Referrer Collection', () => {
    it('multiple referrers can collect independently', async () => {
      // Generate fees for both referrers
      const args1 = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer1.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      const args2 = {
        recipient: wallet.address,
        zeroForOne: false,
        amountSpecified: expandTo18Decimals(1).div(10),
        sqrtPriceLimitX96: encodePriceSqrt(2, 1),
        swapReferrer: referrer2.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args1)
      await swapTargetCallee.swapWithReferrer(pool.address, args2)

      // Get balances before collection
      const balance1Before = await token0.balanceOf(referrer1.address)
      const balance2Before = await token1.balanceOf(referrer2.address)
      const fees1Before = await pool.referrerFees(referrer1.address)
      const fees2Before = await pool.referrerFees(referrer2.address)

      // Both collect their own fees
      await pool.connect(referrer1).collectMyReferrerFees()
      await pool.connect(referrer2).collectMyReferrerFees()

      // Verify independent collection
      const balance1After = await token0.balanceOf(referrer1.address)
      const balance2After = await token1.balanceOf(referrer2.address)

      expect(balance1After.sub(balance1Before)).to.eq(fees1Before.token0)
      expect(balance2After.sub(balance2Before)).to.eq(fees2Before.token1)

      // Verify fees cleared
      const fees1After = await pool.referrerFees(referrer1.address)
      const fees2After = await pool.referrerFees(referrer2.address)

      expect(fees1After.token0).to.eq(0)
      expect(fees2After.token1).to.eq(0)

      console.log('Referrer1 collected:', balance1After.sub(balance1Before).toString())
      console.log('Referrer2 collected:', balance2After.sub(balance2Before).toString())
    })
  })

  describe('Fee Hierarchy', () => {
    it('maintains correct fee hierarchy: protocol -> referrer -> LPs', async () => {
      await pool.setFeeProtocol(4, 4) // 25% protocol fee
      await pool.setFeeSwapReferrer(5, 5) // 20% of remaining for referrer

      const protocolFeesBefore = await pool.protocolFees()

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(2),
        sqrtPriceLimitX96: encodePriceSqrt(1, 4),
        swapReferrer: referrer1.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args)

      const protocolFeesAfter = await pool.protocolFees()
      const referrerFees = await pool.referrerFees(referrer1.address)

      // Both should have received fees
      expect(protocolFeesAfter.token0).to.be.gt(protocolFeesBefore.token0)
      expect(referrerFees.token0).to.be.gt(0)

      // Protocol fees should be larger (extracted first)
      expect(protocolFeesAfter.token0.sub(protocolFeesBefore.token0)).to.be.gt(referrerFees.token0)

      console.log('Protocol fees:', protocolFeesAfter.token0.sub(protocolFeesBefore.token0).toString())
      console.log('Referrer fees:', referrerFees.token0.toString())
    })
  })

  describe('Edge Cases', () => {
    it('handles zero referrer address', async () => {
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: ethers.constants.AddressZero,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args)

      const fees = await pool.referrerFees(ethers.constants.AddressZero)
      expect(fees.token0).to.eq(0)
      expect(fees.token1).to.eq(0)
    })

    it('handles disabled referrer fees', async () => {
      await pool.setFeeSwapReferrer(0, 0)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: expandTo18Decimals(1).div(20),
        sqrtPriceLimitX96: encodePriceSqrt(1, 2),
        swapReferrer: referrer1.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args)

      const fees = await pool.referrerFees(referrer1.address)
      expect(fees.token0).to.eq(0)
      expect(fees.token1).to.eq(0)
    })
  })

  describe('Backwards Compatibility', () => {
    it('original swap function works and does not affect referrer fees', async () => {
      await expect(
        poolFunctions.swapExact0For1(expandTo18Decimals(1).div(100), wallet.address)
      ).to.emit(pool, 'Swap')

      const fees = await pool.referrerFees(referrer1.address)
      expect(fees.token0).to.eq(0)
      expect(fees.token1).to.eq(0)
    })
  })
})