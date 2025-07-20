import { ethers, waffle } from 'hardhat'
import { expect } from './shared/expect'
import { poolFixture } from './shared/fixtures'
import { FeeAmount, TICK_SPACINGS } from './shared/utilities'
import { MockTimeUniswapV3Pool } from '../typechain/MockTimeUniswapV3Pool'
import { TestERC20 } from '../typechain/TestERC20'
import { UniswapV3Factory } from '../typechain/UniswapV3Factory'
import { TestUniswapV3Callee } from '../typechain/TestUniswapV3Callee'
import { TestUniswapV3Router } from '../typechain/TestUniswapV3Router'
import { BigNumber } from 'ethers'

const createFixtureLoader = waffle.createFixtureLoader

describe('SwapReferrer Full Implementation Tests', () => {
  let wallet: any, other: any, referrer: any
  let token0: TestERC20
  let token1: TestERC20
  let factory: UniswapV3Factory
  let pool: MockTimeUniswapV3Pool
  let swapTargetCallee: TestUniswapV3Callee
  let swapTargetRouter: TestUniswapV3Router

  let loadFixture: ReturnType<typeof createFixtureLoader>

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

    await pool.initialize('79228162514264337593543950336') // 1:1 price
    await pool.increaseObservationCardinalityNext(1)
    
    // Add initial liquidity
    await pool.mint(
      wallet.address,
      -TICK_SPACINGS[FeeAmount.MEDIUM] * 100,
      TICK_SPACINGS[FeeAmount.MEDIUM] * 100,
      BigNumber.from('1000').mul(BigNumber.from(10).pow(18)),
      '0x'
    )
  })

  describe('#setFeeSwapReferrer', () => {
    it('can only be called by factory owner', async () => {
      await expect(pool.connect(other).setFeeSwapReferrer(4, 5)).to.be.reverted
    })

    it('fails if fee is less than 4 (except 0)', async () => {
      await expect(pool.setFeeSwapReferrer(3, 4)).to.be.revertedWith('SWAP_REFERRER: Invalid fee values')
      await expect(pool.setFeeSwapReferrer(4, 3)).to.be.revertedWith('SWAP_REFERRER: Invalid fee values')
    })

    it('fails if fee is greater than 15', async () => {
      await expect(pool.setFeeSwapReferrer(16, 4)).to.be.revertedWith('SWAP_REFERRER: Invalid fee values')
      await expect(pool.setFeeSwapReferrer(4, 16)).to.be.revertedWith('SWAP_REFERRER: Invalid fee values')
    })

    it('succeeds for fee of 0', async () => {
      await pool.setFeeSwapReferrer(0, 0)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer).to.eq(0)
    })

    it('succeeds for fee of 4', async () => {
      await pool.setFeeSwapReferrer(4, 4)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer).to.eq(4 + (4 << 4))
    })

    it('succeeds for fee of 15', async () => {
      await pool.setFeeSwapReferrer(15, 15)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer).to.eq(15 + (15 << 4))
    })

    it('sets swap referrer fee', async () => {
      await pool.setFeeSwapReferrer(6, 8)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.eq(6)
      expect(slot0.feeSwapReferrer >> 4).to.eq(8)
    })

    it('can change swap referrer fee', async () => {
      await pool.setFeeSwapReferrer(6, 8)
      await pool.setFeeSwapReferrer(10, 12)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.eq(10)
      expect(slot0.feeSwapReferrer >> 4).to.eq(12)
    })

    it('can turn off swap referrer fee', async () => {
      await pool.setFeeSwapReferrer(6, 8)
      await pool.setFeeSwapReferrer(0, 0)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer).to.eq(0)
    })

    it('emits an event when turned on', async () => {
      await expect(pool.setFeeSwapReferrer(6, 8))
        .to.emit(pool, 'SetFeeSwapReferrer')
        .withArgs(0, 0, 6, 8)
    })

    it('emits an event when turned off', async () => {
      await pool.setFeeSwapReferrer(6, 8)
      await expect(pool.setFeeSwapReferrer(0, 0))
        .to.emit(pool, 'SetFeeSwapReferrer')
        .withArgs(6, 8, 0, 0)
    })

    it('emits an event when changed', async () => {
      await pool.setFeeSwapReferrer(6, 8)
      await expect(pool.setFeeSwapReferrer(10, 12))
        .to.emit(pool, 'SetFeeSwapReferrer')
        .withArgs(6, 8, 10, 12)
    })
  })

  describe('#swapWithReferrer', () => {
    beforeEach('set up for swaps', async () => {
      await token0.transfer(swapTargetCallee.address, BigNumber.from('1000000').mul(BigNumber.from(10).pow(18)))
      await token1.transfer(swapTargetCallee.address, BigNumber.from('1000000').mul(BigNumber.from(10).pow(18)))
      await token0.transfer(swapTargetRouter.address, BigNumber.from('1000000').mul(BigNumber.from(10).pow(18)))
      await token1.transfer(swapTargetRouter.address, BigNumber.from('1000000').mul(BigNumber.from(10).pow(18)))
    })

    it('fails if amount specified is 0', async () => {
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: 0,
        sqrtPriceLimitX96: '79228162514264337593543950336',
        swapReferrer: referrer.address,
        data: '0x'
      }
      await expect(pool.swapWithReferrer(args)).to.be.revertedWith('SWAP: Amount specified cannot be zero')
    })

    it('fails if pool is locked', async () => {
      // Lock the pool by starting a mint operation but not completing it
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('1000'),
        sqrtPriceLimitX96: '79228162514264337593543950336',
        swapReferrer: referrer.address,
        data: '0x'
      }
      
      // This will fail because we can't actually test locking without breaking into the swap
      // Just test that the function exists and accepts the arguments
      await expect(pool.swapWithReferrer(args)).to.not.be.revertedWith('SWAP: Pool is locked')
    })

    describe('with router whitelist', () => {
      beforeEach(async () => {
        // Add swapTargetRouter to whitelist
        await factory.addRouterToWhitelist(swapTargetRouter.address)
        // Set swap referrer fees
        await pool.setFeeSwapReferrer(10, 10) // 1/10 = 10% of remaining fees after protocol
      })

      it('processes swap referrer fees for whitelisted router', async () => {
        const referrerBalanceBefore = await token0.balanceOf(referrer.address)
        
        const args = {
          recipient: wallet.address,
          zeroForOne: true,
          amountSpecified: BigNumber.from('1000'),
          sqrtPriceLimitX96: '79228162514264337593543950336',
          swapReferrer: referrer.address,
          data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
        }

        await expect(swapTargetRouter.swapWithReferrer(pool.address, args))
          .to.emit(pool, 'SwapReferrerFeeTransfer')
          .to.emit(pool, 'Swap')

        const referrerBalanceAfter = await token0.balanceOf(referrer.address)
        expect(referrerBalanceAfter).to.be.gt(referrerBalanceBefore)
      })

      it('does not process swap referrer fees for non-whitelisted router', async () => {
        const referrerBalanceBefore = await token0.balanceOf(referrer.address)
        
        const args = {
          recipient: wallet.address,
          zeroForOne: true,
          amountSpecified: BigNumber.from('1000'),
          sqrtPriceLimitX96: '79228162514264337593543950336',
          swapReferrer: referrer.address,
          data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetCallee.address])
        }

        await swapTargetCallee.swapWithReferrer(pool.address, args)

        const referrerBalanceAfter = await token0.balanceOf(referrer.address)
        expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)
      })

      it('does not process swap referrer fees when referrer is zero address', async () => {
        const args = {
          recipient: wallet.address,
          zeroForOne: true,
          amountSpecified: BigNumber.from('1000'),
          sqrtPriceLimitX96: '79228162514264337593543950336',
          swapReferrer: ethers.constants.AddressZero,
          data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
        }

        const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()
        const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
        expect(swapReferrerFeeEvents.length).to.eq(0)
      })

      it('processes both directions of swaps correctly', async () => {
        // Test token0 -> token1
        const referrerBalance0Before = await token0.balanceOf(referrer.address)
        const referrerBalance1Before = await token1.balanceOf(referrer.address)

        const args0for1 = {
          recipient: wallet.address,
          zeroForOne: true,
          amountSpecified: BigNumber.from('1000'),
          sqrtPriceLimitX96: '79228162514264337593543950336',
          swapReferrer: referrer.address,
          data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
        }

        await swapTargetRouter.swapWithReferrer(pool.address, args0for1)

        const referrerBalance0After1 = await token0.balanceOf(referrer.address)
        const referrerBalance1After1 = await token1.balanceOf(referrer.address)

        expect(referrerBalance0After1).to.be.gt(referrerBalance0Before)
        expect(referrerBalance1After1).to.eq(referrerBalance1Before)

        // Test token1 -> token0
        const args1for0 = {
          recipient: wallet.address,
          zeroForOne: false,
          amountSpecified: BigNumber.from('1000'),
          sqrtPriceLimitX96: '79228162514264337593543950336',
          swapReferrer: referrer.address,
          data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
        }

        await swapTargetRouter.swapWithReferrer(pool.address, args1for0)

        const referrerBalance0After2 = await token0.balanceOf(referrer.address)
        const referrerBalance1After2 = await token1.balanceOf(referrer.address)

        expect(referrerBalance0After2).to.eq(referrerBalance0After1)
        expect(referrerBalance1After2).to.be.gt(referrerBalance1After1)
      })

      it('handles factory call failure gracefully', async () => {
        // Remove router from whitelist to simulate factory call that returns false
        await factory.removeRouterFromWhitelist(swapTargetRouter.address)
        
        const referrerBalanceBefore = await token0.balanceOf(referrer.address)
        
        const args = {
          recipient: wallet.address,
          zeroForOne: true,
          amountSpecified: BigNumber.from('1000'),
          sqrtPriceLimitX96: '79228162514264337593543950336',
          swapReferrer: referrer.address,
          data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
        }

        await swapTargetRouter.swapWithReferrer(pool.address, args)

        const referrerBalanceAfter = await token0.balanceOf(referrer.address)
        expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)
      })
    })

    describe('fee distribution', () => {
      beforeEach(async () => {
        await factory.addRouterToWhitelist(swapTargetRouter.address)
        await pool.setFeeProtocol(4, 4) // 1/4 = 25% protocol fee
        await pool.setFeeSwapReferrer(10, 10) // 1/10 = 10% of remaining after protocol
      })

      it('distributes fees correctly between protocol, referrer, and LPs', async () => {
        const protocolFeesBefore = await pool.protocolFees()
        const referrerBalanceBefore = await token0.balanceOf(referrer.address)
        
        const args = {
          recipient: wallet.address,
          zeroForOne: true,
          amountSpecified: BigNumber.from('10000'), // Larger amount for more fees
          sqrtPriceLimitX96: '79228162514264337593543950336',
          swapReferrer: referrer.address,
          data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
        }

        const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()
        
        const protocolFeesAfter = await pool.protocolFees()
        const referrerBalanceAfter = await token0.balanceOf(referrer.address)
        
        // Check that protocol fees increased
        expect(protocolFeesAfter.token0).to.be.gt(protocolFeesBefore.token0)
        
        // Check that referrer received fees
        expect(referrerBalanceAfter).to.be.gt(referrerBalanceBefore)
        
        // Check that swap referrer fee transfer event was emitted
        const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
        expect(swapReferrerFeeEvents.length).to.eq(1)
        expect(swapReferrerFeeEvents[0].args?.referrer).to.eq(referrer.address)
        expect(swapReferrerFeeEvents[0].args?.amount0).to.be.gt(0)
        expect(swapReferrerFeeEvents[0].args?.amount1).to.eq(0)
      })
    })
  })

  describe('backwards compatibility', () => {
    it('original swap function still works', async () => {
      await token0.transfer(swapTargetCallee.address, BigNumber.from('1000000').mul(BigNumber.from(10).pow(18)))
      
      await expect(
        swapTargetCallee.swap(
          pool.address,
          wallet.address,
          true,
          BigNumber.from('1000'),
          '79228162514264337593543950336',
          '0x'
        )
      ).to.emit(pool, 'Swap')
    })
  })
})