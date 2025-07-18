import { ethers, waffle } from 'hardhat'
import { UniswapV3FactoryCore } from '../typechain/UniswapV3FactoryCore'
import { UniswapV3FactoryExtensions } from '../typechain/UniswapV3FactoryExtensions'
import { UniswapV3FactoryV2 } from '../typechain/UniswapV3FactoryV2'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from './shared/expect'

const createFixtureLoader = waffle.createFixtureLoader

describe('Factory Extension Architecture', () => {
  let wallet: SignerWithAddress, other: SignerWithAddress

  let factoryCore: UniswapV3FactoryCore
  let factoryExtensions: UniswapV3FactoryExtensions
  let factoryV2: UniswapV3FactoryV2
  
  const fixture = async () => {
    // Deploy Core
    const factoryCoreFactory = await ethers.getContractFactory('UniswapV3FactoryCore')
    const core = (await factoryCoreFactory.deploy()) as unknown as UniswapV3FactoryCore

    // Deploy Extensions
    const factoryExtensionsFactory = await ethers.getContractFactory('UniswapV3FactoryExtensions')
    const extensions = (await factoryExtensionsFactory.deploy(core.address)) as unknown as UniswapV3FactoryExtensions

    // Set extensions in core
    await core.setExtensions(extensions.address)

    // Deploy V2 wrapper
    const factoryV2Factory = await ethers.getContractFactory('UniswapV3FactoryV2')
    const factoryV2 = (await factoryV2Factory.deploy(core.address, extensions.address)) as unknown as UniswapV3FactoryV2

    // Set wrapper in extensions
    await extensions.setWrapper(factoryV2.address)

    return { core, extensions, factoryV2 }
  }

  let loadFixture: ReturnType<typeof createFixtureLoader>
  before('create fixture loader', async () => {
    const signers = await ethers.getSigners()
    wallet = signers[0]
    other = signers[1]

    loadFixture = createFixtureLoader([wallet, other])
  })

  beforeEach('deploy factory', async () => {
    const result = await loadFixture(fixture)
    factoryCore = result.core
    factoryExtensions = result.extensions
    factoryV2 = result.factoryV2
  })

  it('core contract size is within limits', async () => {
    const coreSize = ((await waffle.provider.getCode(factoryCore.address)).length - 2) / 2
    console.log(`Core contract size: ${coreSize} bytes`)
    expect(coreSize).to.be.lessThan(24576)
  })

  it('extensions contract size is within limits', async () => {
    const extensionsSize = ((await waffle.provider.getCode(factoryExtensions.address)).length - 2) / 2
    console.log(`Extensions contract size: ${extensionsSize} bytes`)
    expect(extensionsSize).to.be.lessThan(24576)
  })

  it('v2 wrapper contract size is within limits', async () => {
    const v2Size = ((await waffle.provider.getCode(factoryV2.address)).length - 2) / 2
    console.log(`V2 wrapper contract size: ${v2Size} bytes`)
    expect(v2Size).to.be.lessThan(24576)
  })

  it('basic functionality works', async () => {
    // Test core functionality
    expect(await factoryV2.owner()).to.eq(wallet.address)
    
    // Test router whitelist
    expect(await factoryV2.isRouterWhitelisted(other.address)).to.eq(false)
    await factoryV2.addRouterToWhitelist(other.address)
    expect(await factoryV2.isRouterWhitelisted(other.address)).to.eq(true)
    
    // Test referrer fees
    expect(await factoryExtensions.defaultSwapReferrerFee()).to.eq(0)
    await factoryExtensions.setDefaultSwapReferrerFee(5)
    expect(await factoryExtensions.defaultSwapReferrerFee()).to.eq(5)
  })
})