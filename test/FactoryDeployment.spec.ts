import { ethers } from 'hardhat'
import { expect } from './shared/expect'
import { Contract } from 'ethers'

describe('Factory Deployment Test', () => {
  it('should deploy factory with router whitelist functionality', async () => {
    const [wallet] = await ethers.getSigners()
    
    // Deploy Core
    const factoryCoreFactory = await ethers.getContractFactory('UniswapV3FactoryCore')
    const core = await factoryCoreFactory.deploy()

    // Deploy Extensions
    const factoryExtensionsFactory = await ethers.getContractFactory('UniswapV3FactoryExtensions')
    const extensions = await factoryExtensionsFactory.deploy(core.address)

    // Set extensions in core
    await core.setExtensions(extensions.address)

    // Deploy V2 wrapper
    const factoryV2Factory = await ethers.getContractFactory('UniswapV3FactoryV2')
    const factory: Contract = await factoryV2Factory.deploy(core.address, extensions.address)

    // Set wrapper in extensions
    await extensions.setWrapper(factory.address)
    
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
    
    // Deploy Core
    const factoryCoreFactory = await ethers.getContractFactory('UniswapV3FactoryCore')
    const core = await factoryCoreFactory.deploy()

    // Deploy Extensions
    const factoryExtensionsFactory = await ethers.getContractFactory('UniswapV3FactoryExtensions')
    const extensions = await factoryExtensionsFactory.deploy(core.address)

    // Set extensions in core
    await core.setExtensions(extensions.address)

    // Deploy V2 wrapper
    const factoryV2Factory = await ethers.getContractFactory('UniswapV3FactoryV2')
    const factory: Contract = await factoryV2Factory.deploy(core.address, extensions.address)

    // Set wrapper in extensions
    await extensions.setWrapper(factory.address)
    
    // Test existing functionality still works
    expect(await factory.owner()).to.equal(wallet.address)
    expect(await factory.feeAmountTickSpacing(500)).to.equal(10)
    expect(await factory.feeAmountTickSpacing(3000)).to.equal(60)
    expect(await factory.feeAmountTickSpacing(10000)).to.equal(200)
    
    console.log('✅ Existing factory functionality preserved')
  })
})