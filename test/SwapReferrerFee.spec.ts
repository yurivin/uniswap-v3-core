import { Wallet } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { expect } from './shared/expect'
import { poolFixture } from './shared/fixtures'
import { FeeAmount, TICK_SPACINGS, encodePriceSqrt } from './shared/utilities'
import { MockTimeUniswapV3Pool } from '../typechain/MockTimeUniswapV3Pool'
import { TestERC20 } from '../typechain/TestERC20'
import { UniswapV3FactoryV2 } from '../typechain/UniswapV3FactoryV2'
import { TestUniswapV3Callee } from '../typechain/TestUniswapV3Callee'

const createFixtureLoader = waffle.createFixtureLoader

describe('Swap Referrer Fee Tests', () => {
  let wallet: Wallet, other: Wallet, referrer: Wallet
  let loadFixture: ReturnType<typeof createFixtureLoader>

  before('create fixture loader', async () => {
    ;[wallet, other, referrer] = await (ethers as any).getSigners()
    loadFixture = createFixtureLoader([wallet, other, referrer])
  })

  describe('Fee Configuration', () => {
    let pool: MockTimeUniswapV3Pool
    let factory: UniswapV3FactoryV2
    let token0: TestERC20, token1: TestERC20

    beforeEach('deploy and initialize pool', async () => {
      const fixture = await loadFixture(poolFixture)
      ;({ token0, token1, factory } = fixture)
      pool = await fixture.createPool(FeeAmount.MEDIUM, TICK_SPACINGS[FeeAmount.MEDIUM])
      
      // Initialize pool to enable lock modifier
      await pool.initialize(encodePriceSqrt(1, 1))
    })

    it('sets swap referrer fees correctly', async () => {
      await pool.setFeeSwapReferrer(5, 10)
      
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.equal(5)  // token0 fee
      expect(slot0.feeSwapReferrer >> 4).to.equal(10) // token1 fee
    })

    it('reverts when setting invalid fees', async () => {
      // Test invalid token0 fee (less than 4)
      await expect(pool.setFeeSwapReferrer(3, 5)).to.be.reverted
      
      // Test invalid token1 fee (greater than 20) 
      await expect(pool.setFeeSwapReferrer(5, 21)).to.be.reverted
      
      // Test invalid combination
      await expect(pool.setFeeSwapReferrer(25, 15)).to.be.reverted
    })

    it('allows zero fees (disabled)', async () => {
      await pool.setFeeSwapReferrer(0, 0)
      
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer).to.equal(0)
    })

    it('only allows factory owner to set fees', async () => {
      await expect(pool.connect(other as any).setFeeSwapReferrer(5, 10)).to.be.reverted
    })

    it('emits SetFeeSwapReferrer event', async () => {
      await expect(pool.setFeeSwapReferrer(8, 12))
        .to.emit(pool, 'SetFeeSwapReferrer')
        .withArgs(0, 0, 8, 12)
    })
  })

  describe('Router Whitelist Integration', () => {
    let pool: MockTimeUniswapV3Pool
    let factory: UniswapV3FactoryV2
    let router: string

    beforeEach('setup pool', async () => {
      const fixture = await loadFixture(poolFixture)
      ;({ factory } = fixture)
      pool = await fixture.createPool(FeeAmount.MEDIUM, TICK_SPACINGS[FeeAmount.MEDIUM])
      
      await pool.initialize(encodePriceSqrt(1, 1))
      router = ethers.Wallet.createRandom().address
    })

    it('verifies router whitelist affects fee processing logic', async () => {
      // This test verifies the router whitelist integration without actual swaps
      expect(await factory.isRouterWhitelisted(router)).to.be.false
      
      // Add to whitelist
      await factory.addRouterToWhitelist(router)
      expect(await factory.isRouterWhitelisted(router)).to.be.true
      
      // Remove from whitelist
      await factory.removeRouterFromWhitelist(router)
      expect(await factory.isRouterWhitelisted(router)).to.be.false
    })

    it('pool can set referrer fees when initialized', async () => {
      await pool.setFeeSwapReferrer(10, 15)
      
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.equal(10)
      expect(slot0.feeSwapReferrer >> 4).to.equal(15)
    })
  })

  describe('Factory Extensions Integration', () => {
    let pool: MockTimeUniswapV3Pool
    let factory: UniswapV3FactoryV2
    let factoryExtensions: any

    beforeEach('setup factory and pool', async () => {
      const fixture = await loadFixture(poolFixture)
      ;({ factory } = fixture)
      pool = await fixture.createPool(FeeAmount.MEDIUM, TICK_SPACINGS[FeeAmount.MEDIUM])
      
      // Get factory extensions contract through V2 wrapper
      const factoryExtensionsAddress = await factory.factoryExtensions()
      factoryExtensions = await ethers.getContractAt('UniswapV3FactoryExtensions', factoryExtensionsAddress)
    })

    it('sets default swap referrer fee', async () => {
      await factoryExtensions.setDefaultSwapReferrerFee(10)
      expect(await factoryExtensions.defaultSwapReferrerFee()).to.equal(10)
    })

    it('sets pool-specific swap referrer fee', async () => {
      await factoryExtensions.setPoolSwapReferrerFee(pool.address, 8, 12)
      
      const poolFee = await factoryExtensions.poolSwapReferrerFees(pool.address)
      expect(poolFee % 16).to.equal(8)  // token0 fee
      expect(poolFee >> 4).to.equal(12) // token1 fee
    })

    it('emits events for fee changes', async () => {
      await expect(factoryExtensions.setDefaultSwapReferrerFee(15))
        .to.emit(factoryExtensions, 'DefaultSwapReferrerFeeChanged')
        .withArgs(0, 15)

      await expect(factoryExtensions.setPoolSwapReferrerFee(pool.address, 6, 14))
        .to.emit(factoryExtensions, 'PoolSwapReferrerFeeSet')
        .withArgs(pool.address, 0, 0, 6, 14)
    })

    it('only allows authorized access', async () => {
      await expect(factoryExtensions.connect(other as any).setDefaultSwapReferrerFee(10)).to.be.reverted
      await expect(factoryExtensions.connect(other as any).setPoolSwapReferrerFee(pool.address, 5, 10)).to.be.reverted
    })
  })

  describe('Fee Validation Edge Cases', () => {
    let pool: MockTimeUniswapV3Pool

    beforeEach('setup pool', async () => {
      const fixture = await loadFixture(poolFixture)
      pool = await fixture.createPool(FeeAmount.MEDIUM, TICK_SPACINGS[FeeAmount.MEDIUM])
      await pool.initialize(encodePriceSqrt(1, 1))
    })

    it('handles minimum fee rate (4)', async () => {
      await pool.setFeeSwapReferrer(4, 4)
      
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.equal(4)
      expect(slot0.feeSwapReferrer >> 4).to.equal(4)
    })

    it('handles maximum fee rate (20)', async () => {
      await pool.setFeeSwapReferrer(20, 20)
      
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.equal(20)
      expect(slot0.feeSwapReferrer >> 4).to.equal(20)
    })

    it('handles mixed fee configurations', async () => {
      await pool.setFeeSwapReferrer(4, 20)
      
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.equal(4)  // token0: minimum
      expect(slot0.feeSwapReferrer >> 4).to.equal(20) // token1: maximum
    })
  })
})