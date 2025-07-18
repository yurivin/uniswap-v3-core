import { Wallet, Contract } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { expect } from './shared/expect'

const { deployContract } = waffle

describe('RouterWhitelist', () => {
  let factory: Contract
  let wallet: Wallet
  let other: Wallet
  let router1: string
  let router2: string
  let router3: string

  beforeEach(async () => {
    ;[wallet, other] = await (ethers as any).getSigners()
    router1 = ethers.Wallet.createRandom().address
    router2 = ethers.Wallet.createRandom().address
    router3 = ethers.Wallet.createRandom().address
    
    const factoryFactory = await ethers.getContractFactory('UniswapV3Factory')
    factory = await factoryFactory.deploy()
  })

  describe('addRouterToWhitelist', () => {
    it('adds router to whitelist', async () => {
      await factory.addRouterToWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router1)).to.be.true
    })

    it('reverts if not owner', async () => {
      await expect(factory.connect(other as any).addRouterToWhitelist(router1)).to.be.reverted
    })

    it('reverts if router already whitelisted', async () => {
      await factory.addRouterToWhitelist(router1)
      await expect(factory.addRouterToWhitelist(router1)).to.be.reverted
    })

    it('reverts if router is zero address', async () => {
      await expect(factory.addRouterToWhitelist(ethers.constants.AddressZero)).to.be.reverted
    })

    it('emits RouterWhitelisted event with correct parameters', async () => {
      await expect(factory.addRouterToWhitelist(router1))
        .to.emit(factory, 'RouterWhitelisted')
        .withArgs(router1, wallet.address)
    })

    it('successfully adds multiple routers', async () => {
      await factory.addRouterToWhitelist(router1)
      await factory.addRouterToWhitelist(router2)
      expect(await factory.isRouterWhitelisted(router1)).to.be.true
      expect(await factory.isRouterWhitelisted(router2)).to.be.true
    })
  })

  describe('removeRouterFromWhitelist', () => {
    beforeEach(async () => {
      await factory.addRouterToWhitelist(router1)
    })

    it('removes router from whitelist', async () => {
      await factory.removeRouterFromWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router1)).to.be.false
    })

    it('reverts if not owner', async () => {
      await expect(factory.connect(other as any).removeRouterFromWhitelist(router1)).to.be.reverted
    })

    it('reverts if router not whitelisted', async () => {
      await expect(factory.removeRouterFromWhitelist(router2)).to.be.reverted
    })

    it('emits RouterRemovedFromWhitelist event with correct parameters', async () => {
      await expect(factory.removeRouterFromWhitelist(router1))
        .to.emit(factory, 'RouterRemovedFromWhitelist')
        .withArgs(router1, wallet.address)
    })
  })

  describe('isRouterWhitelisted', () => {
    it('returns true for whitelisted router', async () => {
      await factory.addRouterToWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router1)).to.be.true
    })

    it('returns false for non-whitelisted router', async () => {
      await factory.addRouterToWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router2)).to.be.false
    })

    it('returns false for zero address', async () => {
      expect(await factory.isRouterWhitelisted(ethers.constants.AddressZero)).to.be.false
    })

    it('returns false after router removal', async () => {
      await factory.addRouterToWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router1)).to.be.true
      await factory.removeRouterFromWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router1)).to.be.false
    })
  })

  describe('core functionality', () => {
    it('basic whitelist workflow', async () => {
      // Add routers
      await factory.addRouterToWhitelist(router1)
      await factory.addRouterToWhitelist(router2)
      expect(await factory.isRouterWhitelisted(router1)).to.be.true
      expect(await factory.isRouterWhitelisted(router2)).to.be.true
      
      // Remove one router
      await factory.removeRouterFromWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router1)).to.be.false
      expect(await factory.isRouterWhitelisted(router2)).to.be.true
    })
  })

  describe('access control integration', () => {
    it('transfer ownership - new owner can manage whitelist', async () => {
      await factory.setOwner(other.address)
      await factory.connect(other as any).addRouterToWhitelist(router1)
      expect(await factory.isRouterWhitelisted(router1)).to.be.true
    })

    it('transfer ownership - old owner cannot manage whitelist', async () => {
      await factory.setOwner(other.address)
      await expect(factory.addRouterToWhitelist(router1)).to.be.reverted
    })

    it('verifies all functions respect owner-only access control', async () => {
      const functions = [
        () => factory.connect(other as any).addRouterToWhitelist(router1),
        () => factory.connect(other as any).removeRouterFromWhitelist(router1)
      ]

      for (const func of functions) {
        await expect(func()).to.be.reverted
      }
    })
  })
})