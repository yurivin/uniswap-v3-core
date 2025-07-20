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

describe('SwapReferrer Debug Callee Tests', () => {
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

  it('tests swapWithReferrer via callee with referrer address but no whitelist', async () => {
    console.log('Testing swapWithReferrer via callee with referrer but no whitelist...')
    
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(100),
      sqrtPriceLimitX96: encodePriceSqrt(1, 2),
      swapReferrer: referrer.address, // Real referrer address
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
    }

    try {
      await swapTargetCallee.swapWithReferrer(pool.address, args)
      console.log('✅ Swap via callee with referrer successful')
    } catch (error) {
      console.log('❌ Swap via callee with referrer failed:', error.message)
      throw error
    }
  })

  it('tests swapWithReferrer via callee with whitelist but no fees', async () => {
    console.log('Testing swapWithReferrer via callee with whitelist but no fees...')
    
    // Add callee to whitelist
    await factory.addRouterToWhitelist(swapTargetCallee.address)
    
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(100),
      sqrtPriceLimitX96: encodePriceSqrt(1, 2),
      swapReferrer: referrer.address,
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
    }

    try {
      await swapTargetCallee.swapWithReferrer(pool.address, args)
      console.log('✅ Swap via callee with whitelist successful')
    } catch (error) {
      console.log('❌ Swap via callee with whitelist failed:', error.message)
      throw error
    }
  })

  it('tests swapWithReferrer via callee with everything enabled', async () => {
    console.log('Testing swapWithReferrer via callee with full setup...')
    
    // Full setup
    await factory.addRouterToWhitelist(swapTargetCallee.address)
    await pool.setFeeSwapReferrer(10, 10)
    
    console.log('Checking initial referrer fees...')
    const feesBefore = await pool.referrerFees(referrer.address)
    console.log('Initial fees:', feesBefore.token0.toString(), feesBefore.token1.toString())
    
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(100),
      sqrtPriceLimitX96: encodePriceSqrt(1, 2),
      swapReferrer: referrer.address,
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address])
    }

    try {
      await swapTargetCallee.swapWithReferrer(pool.address, args)
      console.log('✅ Swap via callee with full setup successful')
      
      const feesAfter = await pool.referrerFees(referrer.address)
      console.log('Final fees:', feesAfter.token0.toString(), feesAfter.token1.toString())
      
      if (feesAfter.token0.gt(0)) {
        console.log('✅ Fees accumulated successfully!')
      } else {
        console.log('⚠️ No fees accumulated')
      }
    } catch (error) {
      console.log('❌ Swap via callee with full setup failed:', error.message)
      throw error
    }
  })
})