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

describe('SwapReferrer Debug Accumulate Tests', () => {
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

    poolFunctions = createPoolFunctions({
      swapTarget: swapTargetCallee,
      token0,
      token1,
      pool
    })

    await pool.initialize(encodePriceSqrt(1, 1))
    await poolFunctions.mint(wallet.address, -TICK_SPACINGS[FeeAmount.MEDIUM] * 100, TICK_SPACINGS[FeeAmount.MEDIUM] * 100, expandTo18Decimals(2))
  })

  it('tests basic swapWithReferrer without fees', async () => {
    console.log('Testing swapWithReferrer without any referrer fees configured...')
    
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(100),
      sqrtPriceLimitX96: encodePriceSqrt(1, 2),
      swapReferrer: referrer.address,
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
    }

    try {
      await swapTargetRouter.swapWithReferrer(pool.address, args)
      console.log('✅ Basic swapWithReferrer successful')
    } catch (error) {
      console.log('❌ Basic swapWithReferrer failed:', error.message)
      throw error
    }
  })

  it('tests router whitelist setup', async () => {
    console.log('Testing router whitelist...')
    
    // Check if router is whitelisted initially
    const isWhitelistedBefore = await factory.isRouterWhitelisted(swapTargetRouter.address)
    console.log('Router whitelisted before:', isWhitelistedBefore)
    
    // Add to whitelist
    await factory.addRouterToWhitelist(swapTargetRouter.address)
    const isWhitelistedAfter = await factory.isRouterWhitelisted(swapTargetRouter.address)
    console.log('Router whitelisted after:', isWhitelistedAfter)
    
    expect(isWhitelistedAfter).to.be.true
  })

  it('tests fee configuration', async () => {
    console.log('Testing fee configuration...')
    
    // Check initial fee configuration
    const slot0Before = await pool.slot0()
    console.log('Initial feeSwapReferrer:', slot0Before.feeSwapReferrer)
    
    // Set referrer fees
    await pool.setFeeSwapReferrer(10, 10)
    
    const slot0After = await pool.slot0()
    console.log('After setting feeSwapReferrer:', slot0After.feeSwapReferrer)
    
    expect(slot0After.feeSwapReferrer).to.eq(10 + (10 << 4)) // 10 for token0, 10 for token1
  })

  it('tests swapWithReferrer with whitelist and fees', async () => {
    console.log('Testing swapWithReferrer with whitelist and fees...')
    
    // Setup step by step
    console.log('1. Adding router to whitelist...')
    await factory.addRouterToWhitelist(swapTargetRouter.address)
    
    console.log('2. Setting referrer fees...')
    await pool.setFeeSwapReferrer(10, 10)
    
    console.log('3. Checking initial referrer fees...')
    const feesBefore = await pool.referrerFees(referrer.address)
    console.log('Initial referrer fees:', feesBefore.token0.toString(), feesBefore.token1.toString())
    
    console.log('4. Executing swap...')
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(100),
      sqrtPriceLimitX96: encodePriceSqrt(1, 2),
      swapReferrer: referrer.address,
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
    }

    try {
      await swapTargetRouter.swapWithReferrer(pool.address, args)
      console.log('✅ Swap with referrer successful')
      
      console.log('5. Checking accumulated referrer fees...')
      const feesAfter = await pool.referrerFees(referrer.address)
      console.log('Final referrer fees:', feesAfter.token0.toString(), feesAfter.token1.toString())
      
      expect(feesAfter.token0).to.be.gt(0)
    } catch (error) {
      console.log('❌ Swap with referrer failed:', error.message)
      throw error
    }
  })

  it('tests collectMyReferrerFees function', async () => {
    console.log('Testing collectMyReferrerFees...')
    
    // Setup
    await factory.addRouterToWhitelist(swapTargetRouter.address)
    await pool.setFeeSwapReferrer(10, 10)
    
    // Accumulate some fees
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(50),
      sqrtPriceLimitX96: encodePriceSqrt(1, 2),
      swapReferrer: referrer.address,
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
    }

    await swapTargetRouter.swapWithReferrer(pool.address, args)
    
    const feesAccumulated = await pool.referrerFees(referrer.address)
    console.log('Fees accumulated:', feesAccumulated.token0.toString())
    
    if (feesAccumulated.token0.gt(0)) {
      console.log('Attempting to collect fees...')
      const balanceBefore = await token0.balanceOf(referrer.address)
      
      try {
        const tx = await pool.connect(referrer).collectMyReferrerFees()
        await expect(tx).to.emit(pool, 'CollectReferrerFees')
        
        const balanceAfter = await token0.balanceOf(referrer.address)
        console.log('Balance increase:', balanceAfter.sub(balanceBefore).toString())
        
        expect(balanceAfter.sub(balanceBefore)).to.eq(feesAccumulated.token0)
        console.log('✅ Collection successful')
      } catch (error) {
        console.log('❌ Collection failed:', error.message)
        throw error
      }
    } else {
      console.log('⚠️ No fees accumulated to collect')
    }
  })
})