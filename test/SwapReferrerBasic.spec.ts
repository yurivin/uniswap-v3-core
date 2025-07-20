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

describe('SwapReferrer Basic Tests', () => {
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

    it('succeeds when called by factory owner', async () => {
      await pool.setFeeSwapReferrer(4, 5)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer % 16).to.eq(4)
      expect(slot0.feeSwapReferrer >> 4).to.eq(5)
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

    it('succeeds for fee of 15', async () => {
      await pool.setFeeSwapReferrer(15, 15)
      const slot0 = await pool.slot0()
      expect(slot0.feeSwapReferrer).to.eq(15 + (15 << 4))
    })

    it('emits SetFeeSwapReferrer event', async () => {
      await expect(pool.setFeeSwapReferrer(6, 8))
        .to.emit(pool, 'SetFeeSwapReferrer')
        .withArgs(0, 0, 6, 8)
    })
  })

  describe('#swapWithReferrer', () => {
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

    it('executes swap successfully without referrer fees when no referrer set', async () => {
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('1000'),
        sqrtPriceLimitX96: '4295128740',
        swapReferrer: ethers.constants.AddressZero,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetCallee.address])
      }

      await expect(swapTargetCallee.swapWithReferrer(pool.address, args))
        .to.emit(pool, 'Swap')
    })

    it('executes swap with referrer when router is whitelisted', async () => {
      // Setup: Add router to whitelist and set referrer fees
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeSwapReferrer(10, 10) // 10% of remaining fees after protocol

      const referrerBalanceBefore = await token0.balanceOf(referrer.address)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('10000'), // Larger amount for visible fees
        sqrtPriceLimitX96: '4295128740',
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
      }

      const tx = await swapTargetRouter.swapWithReferrer(pool.address, args)
      await expect(tx)
        .to.emit(pool, 'Swap')
        .to.emit(pool, 'SwapReferrerFeeTransfer')

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.be.gt(referrerBalanceBefore)
    })

    it('does not transfer referrer fees when router is not whitelisted', async () => {
      // Setup: Set referrer fees but don't whitelist router
      await pool.setFeeSwapReferrer(10, 10)

      const referrerBalanceBefore = await token0.balanceOf(referrer.address)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('10000'),
        sqrtPriceLimitX96: '4295128740',
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetCallee.address])
      }

      await swapTargetCallee.swapWithReferrer(pool.address, args)

      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)
    })

    it('does not transfer referrer fees when referrer is zero address', async () => {
      // Setup: Whitelist router and set fees
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeSwapReferrer(10, 10)

      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('10000'),
        sqrtPriceLimitX96: '4295128740',
        swapReferrer: ethers.constants.AddressZero,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
      }

      const receipt = await (await swapTargetRouter.swapWithReferrer(pool.address, args)).wait()
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(0)
    })
  })

  describe('Fee Distribution', () => {
    beforeEach(async () => {
      await factory.addRouterToWhitelist(swapTargetRouter.address)
      await pool.setFeeProtocol(4, 4) // 25% protocol fee
      await pool.setFeeSwapReferrer(10, 10) // 10% of remaining after protocol
    })

    it('distributes fees correctly: protocol -> referrer -> LPs', async () => {
      const protocolFeesBefore = await pool.protocolFees()
      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('100000'), // Large amount for significant fees
        sqrtPriceLimitX96: '4295128740',
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
      
      // Check that swap referrer fee transfer event was emitted with correct amounts
      const swapReferrerFeeEvents = receipt.events?.filter(e => e.event === 'SwapReferrerFeeTransfer') ?? []
      expect(swapReferrerFeeEvents.length).to.eq(1)
      expect(swapReferrerFeeEvents[0].args?.referrer).to.eq(referrer.address)
      expect(swapReferrerFeeEvents[0].args?.amount0).to.be.gt(0)
      expect(swapReferrerFeeEvents[0].args?.amount1).to.eq(0)
    })

    it('handles both token directions correctly', async () => {
      // Test token0 -> token1
      const referrerBalance0Before = await token0.balanceOf(referrer.address)
      const referrerBalance1Before = await token1.balanceOf(referrer.address)

      const args0for1 = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('50000'),
        sqrtPriceLimitX96: '4295128740',
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
        amountSpecified: BigNumber.from('50000'),
        sqrtPriceLimitX96: '1461446703485210103287273052203988822378723970341',
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetRouter.address])
      }

      await swapTargetRouter.swapWithReferrer(pool.address, args1for0)

      const referrerBalance0After2 = await token0.balanceOf(referrer.address)
      const referrerBalance1After2 = await token1.balanceOf(referrer.address)

      expect(referrerBalance0After2).to.eq(referrerBalance0After1)
      expect(referrerBalance1After2).to.be.gt(referrerBalance1After1)
    })
  })

  describe('Backwards Compatibility', () => {
    it('original swap function still works without referrer functionality', async () => {
      await expect(
        swapTargetCallee.swap(
          pool.address,
          wallet.address,
          true,
          BigNumber.from('1000'),
          '4295128740',
          '0x'
        )
      ).to.emit(pool, 'Swap')
    })

    it('original swap does not trigger referrer fees even with referrer fees set', async () => {
      await pool.setFeeSwapReferrer(10, 10)
      
      const referrerBalanceBefore = await token0.balanceOf(referrer.address)
      
      await swapTargetCallee.swap(
        pool.address,
        wallet.address,
        true,
        BigNumber.from('10000'),
        '4295128740',
        '0x'
      )
      
      const referrerBalanceAfter = await token0.balanceOf(referrer.address)
      expect(referrerBalanceAfter).to.eq(referrerBalanceBefore)
    })
  })

  describe('Error Handling', () => {
    it('handles factory call failure gracefully', async () => {
      // This test simulates what happens if the factory call fails
      await pool.setFeeSwapReferrer(10, 10)
      
      const args = {
        recipient: wallet.address,
        zeroForOne: true,
        amountSpecified: BigNumber.from('1000'),
        sqrtPriceLimitX96: '4295128740',
        swapReferrer: referrer.address,
        data: ethers.utils.defaultAbiCoder.encode(['address'], [swapTargetCallee.address])
      }

      // Should not revert even though router is not whitelisted
      await expect(swapTargetCallee.swapWithReferrer(pool.address, args))
        .to.emit(pool, 'Swap')
    })
  })
})