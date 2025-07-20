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

describe('SwapReferrer Debug Tests', () => {
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

  it('compares normal swap vs swapWithReferrer', async () => {
    // First test normal swap to make sure liquidity is working
    console.log('Testing normal swap...')
    await poolFunctions.swapExact0For1(expandTo18Decimals(1).div(100), wallet.address)
    console.log('Normal swap successful')

    // Now test swapWithReferrer with minimal setup
    console.log('Testing swapWithReferrer...')
    
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(100),
      sqrtPriceLimitX96: '4295128740', // Use same as normal swap
      swapReferrer: ethers.constants.AddressZero, // No referrer to start
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address]) // wallet is the sender
    }

    try {
      await swapTargetCallee.swapWithReferrer(pool.address, args)
      console.log('swapWithReferrer successful')
    } catch (error) {
      console.log('swapWithReferrer failed:', error)
      throw error
    }
  })

  it('tests swapWithReferrer with different parameters', async () => {
    console.log('Testing with different sqrtPriceLimitX96...')
    
    // Test with different price limit
    const args = {
      recipient: wallet.address,
      zeroForOne: true,
      amountSpecified: expandTo18Decimals(1).div(100),
      sqrtPriceLimitX96: encodePriceSqrt(1, 2), // Use encodePriceSqrt
      swapReferrer: ethers.constants.AddressZero,
      data: ethers.utils.defaultAbiCoder.encode(['address'], [wallet.address]) // wallet is the sender
    }

    try {
      await swapTargetCallee.swapWithReferrer(pool.address, args)
      console.log('swapWithReferrer with encoded price successful')
    } catch (error) {
      console.log('swapWithReferrer with encoded price failed:', error)
      throw error
    }
  })

  it('tests function selector and interface compatibility', async () => {
    // Check if the function exists
    console.log('Checking if swapWithReferrer function exists...')
    
    // Get the function selector
    const functionSelector = pool.interface.getSighash('swapWithReferrer')
    console.log('Function selector:', functionSelector)

    // Check if pool has the function
    const hasFunction = pool.interface.fragments.some(f => f.name === 'swapWithReferrer')
    console.log('Pool has swapWithReferrer function:', hasFunction)

    // Check slot0 structure
    const slot0 = await pool.slot0()
    console.log('Slot0 structure:', {
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      tick: slot0.tick,
      observationIndex: slot0.observationIndex,
      observationCardinality: slot0.observationCardinality,
      observationCardinalityNext: slot0.observationCardinalityNext,
      feeProtocol: slot0.feeProtocol,
      feeSwapReferrer: slot0.feeSwapReferrer,
      unlocked: slot0.unlocked
    })

    expect(hasFunction).to.be.true
  })
})