import { ethers } from 'hardhat'
import { expect } from './shared/expect'
import { Contract } from 'ethers'

describe('Factory Deployment Test', () => {
  it('should deploy factory with router whitelist functionality', async () => {
    const [wallet] = await ethers.getSigners()
    const factoryFactory = await ethers.getContractFactory('UniswapV3Factory')
    const factory: Contract = await factoryFactory.deploy()
    
    // Test basic factory functionality
    expect(await factory.owner()).to.equal(wallet.address)
    
    // Test new router whitelist functionality
    const routerAddress = '0x1000000000000000000000000000000000000000'
    
    // Initially not whitelisted
    expect(await factory.isRouterWhitelisted(routerAddress)).to.be.false
    
    // Add router to whitelist
    await factory.addRouterToWhitelist(routerAddress)
    expect(await factory.isRouterWhitelisted(routerAddress)).to.be.true
    
    // Test removal
    await factory.removeRouterFromWhitelist(routerAddress)
    expect(await factory.isRouterWhitelisted(routerAddress)).to.be.false
    
    console.log('✅ Factory deployment and router whitelist functionality working correctly')
  })
  
  it('should maintain existing factory functionality', async () => {
    const [wallet] = await ethers.getSigners()
    const factoryFactory = await ethers.getContractFactory('UniswapV3Factory')
    const factory: Contract = await factoryFactory.deploy()
    
    // Test existing functionality still works
    expect(await factory.owner()).to.equal(wallet.address)
    expect(await factory.feeAmountTickSpacing(500)).to.equal(10)
    expect(await factory.feeAmountTickSpacing(3000)).to.equal(60)
    expect(await factory.feeAmountTickSpacing(10000)).to.equal(200)
    
    console.log('✅ Existing factory functionality preserved')
  })
})