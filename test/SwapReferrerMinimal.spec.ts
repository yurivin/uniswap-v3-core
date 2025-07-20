import { ethers, waffle } from 'hardhat'
import { expect } from './shared/expect'
import { poolFixture } from './shared/fixtures'
import { FeeAmount, TICK_SPACINGS } from './shared/utilities'
import { MockTimeUniswapV3Pool } from '../typechain/MockTimeUniswapV3Pool'
import { TestERC20 } from '../typechain/TestERC20'
import { UniswapV3Factory } from '../typechain/UniswapV3Factory'

const createFixtureLoader = waffle.createFixtureLoader

describe('SwapReferrer Minimal Tests', () => {
  let wallet: any, other: any
  let token0: TestERC20
  let token1: TestERC20
  let factory: UniswapV3Factory
  let pool: MockTimeUniswapV3Pool

  let loadFixture: ReturnType<typeof createFixtureLoader>

  before('create fixture loader', async () => {
    const signers = await ethers.getSigners()
    wallet = signers[0]
    other = signers[1]

    loadFixture = createFixtureLoader([wallet, other])
  })

  beforeEach('load fixture', async () => {
    const fixture = await loadFixture(poolFixture)
    token0 = fixture.token0
    token1 = fixture.token1
    factory = fixture.factory
    
    pool = await fixture.createPool(FeeAmount.MEDIUM, TICK_SPACINGS[FeeAmount.MEDIUM])
    await pool.initialize('79228162514264337593543950336') // 1:1 price
  })

  describe('#setFeeSwapReferrer', () => {
    it('can only be called by factory owner', async () => {
      await expect(pool.connect(other).setFeeSwapReferrer(4, 5)).to.be.reverted
    })

    it('succeeds when called by factory owner', async () => {
      await pool.setFeeSwapReferrer(4, 5)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.eq(4)
      expect(slot0.feeSwapReferrer >> 4).to.eq(5)
    })

    it('fails if fee is less than 4 (except 0)', async () => {
      await expect(pool.setFeeSwapReferrer(3, 4)).to.be.revertedWith('SWAP_REFERRER: Invalid fee values')
    })

    it('succeeds for fee of 0', async () => {
      await pool.setFeeSwapReferrer(0, 0)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer).to.eq(0)
    })

    it('emits SetFeeSwapReferrer event', async () => {
      await expect(pool.setFeeSwapReferrer(6, 8))
        .to.emit(pool, 'SetFeeSwapReferrer')
        .withArgs(0, 0, 6, 8)
    })
  })

  describe('slot0 structure', () => {
    it('has correct slot0 structure with feeSwapReferrer', async () => {
      const slot0 = await pool.slot0()
      expect(slot0).to.have.property('sqrtPriceX96')
      expect(slot0).to.have.property('tick')
      expect(slot0).to.have.property('observationIndex')
      expect(slot0).to.have.property('observationCardinality')
      expect(slot0).to.have.property('observationCardinalityNext')
      expect(slot0).to.have.property('feeProtocol')
      expect(slot0).to.have.property('feeSwapReferrer')
      expect(slot0).to.have.property('unlocked')
      
      // Initially feeSwapReferrer should be 0
      expect(slot0.feeSwapReferrer).to.eq(0)
    })
  })
})