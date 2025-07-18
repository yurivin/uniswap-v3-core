# UniswapV3Factory Router Whitelist Implementation Plan

## Overview
This document outlines the implementation plan for adding router whitelist functionality to the UniswapV3Factory contract. The factory will maintain a list of approved routers, and pools will be able to verify if they were called from a whitelisted router.

## Purpose and Benefits

### Why Factory Should Track Routers
1. **Security**: Prevent malicious routers from calling pools with swap referrer fees
2. **Quality Control**: Ensure only trusted routers can benefit from swap referrer fees
3. **Governance**: Allow protocol governance to manage router ecosystem
4. **Fee Protection**: Prevent swap referrer fee abuse by unauthorized contracts
5. **Upgrade Management**: Control which router versions are approved

### Use Cases
- **Swap Referrer Fee Security**: Only whitelisted routers can set swap referrer addresses
- **Router Versioning**: Deprecate old routers while maintaining compatibility
- **Partnership Management**: Approve third-party routers for swap referrer fees
- **Emergency Response**: Quickly remove compromised routers from whitelist

## Current Factory Structure Analysis

### Existing Factory Functionality
- Pool creation and deployment
- Fee amount and tick spacing management
- Protocol fee configuration
- Factory ownership management

### Current Pool-Factory Relationship
- Factory deploys pools
- Factory owner can set protocol fees on pools
- Pools validate factory ownership for sensitive operations

## Proposed Router Whitelist Implementation

### 1. Storage Additions

#### Add router whitelist mapping
```solidity
/// @notice Mapping to track whitelisted routers
/// @dev router address => is whitelisted
mapping(address => bool) public whitelistedRouters;
```

#### Add router list for enumeration (optional)
```solidity
/// @notice Array of all whitelisted router addresses for enumeration
/// @dev Used for off-chain queries and governance
address[] public whitelistedRoutersList;

/// @notice Mapping to track router index in the list
/// @dev router address => index in whitelistedRoutersList (0 means not in list)
mapping(address => uint256) private routerListIndex;
```

### 2. Events

#### Add router whitelist events
```solidity
/// @notice Emitted when a router is added to the whitelist
/// @param router The router address that was whitelisted
/// @param caller The address that added the router
event RouterWhitelisted(address indexed router, address indexed caller);

/// @notice Emitted when a router is removed from the whitelist
/// @param router The router address that was removed
/// @param caller The address that removed the router
event RouterRemovedFromWhitelist(address indexed router, address indexed caller);

/// @notice Emitted when all routers are cleared from whitelist
/// @param caller The address that cleared the whitelist
event WhitelistCleared(address indexed caller);
```

### 3. Interface Updates

#### Add to IUniswapV3Factory.sol
```solidity
/// @notice Returns whether a router is whitelisted
/// @param router The router address to check
/// @return True if the router is whitelisted
function whitelistedRouters(address router) external view returns (bool);

/// @notice Returns the total number of whitelisted routers
/// @return The count of whitelisted routers
function whitelistedRoutersCount() external view returns (uint256);

/// @notice Returns a whitelisted router address by index
/// @param index The index in the whitelisted routers list
/// @return The router address at the given index
function whitelistedRoutersList(uint256 index) external view returns (address);

/// @notice Returns all whitelisted router addresses
/// @return Array of all whitelisted router addresses
function getAllWhitelistedRouters() external view returns (address[] memory);

/// @notice Adds a router to the whitelist
/// @dev Can only be called by the factory owner
/// @param router The router address to whitelist
function addRouterToWhitelist(address router) external;

/// @notice Removes a router from the whitelist
/// @dev Can only be called by the factory owner
/// @param router The router address to remove
function removeRouterFromWhitelist(address router) external;

/// @notice Adds multiple routers to the whitelist
/// @dev Can only be called by the factory owner
/// @param routers Array of router addresses to whitelist
function addMultipleRoutersToWhitelist(address[] calldata routers) external;

/// @notice Removes multiple routers from the whitelist
/// @dev Can only be called by the factory owner
/// @param routers Array of router addresses to remove
function removeMultipleRoutersFromWhitelist(address[] calldata routers) external;

/// @notice Clears all routers from the whitelist
/// @dev Can only be called by the factory owner
function clearRouterWhitelist() external;
```

### 4. Access Control Implementation

#### Owner-only modifier (already exists in UniswapV3Factory)
```solidity
/// @dev Modifier to restrict function access to factory owner only
modifier onlyOwner() {
    require(msg.sender == owner, 'NOT_OWNER');
    _;
}
```

#### Alternative: Use OpenZeppelin Ownable
```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract UniswapV3Factory is IUniswapV3Factory, UniswapV3PoolDeployer, NoDelegateCall, Ownable {
    // ... existing code
    
    // All whitelist functions use onlyOwner modifier from OpenZeppelin
}
```

### 5. Implementation Functions

#### addRouterToWhitelist function
```solidity
/// @inheritdoc IUniswapV3Factory
function addRouterToWhitelist(address router) external override {
    require(msg.sender == owner, 'NOT_OWNER');
    require(router != address(0), 'INVALID_ROUTER');
    require(!whitelistedRouters[router], 'ROUTER_ALREADY_WHITELISTED');
    
    whitelistedRouters[router] = true;
    
    // Add to enumeration list
    whitelistedRoutersList.push(router);
    routerListIndex[router] = whitelistedRoutersList.length; // 1-based index
    
    emit RouterWhitelisted(router, msg.sender);
}
```

#### removeRouterFromWhitelist function
```solidity
/// @inheritdoc IUniswapV3Factory
function removeRouterFromWhitelist(address router) external override {
    require(msg.sender == owner, 'NOT_OWNER');
    require(router != address(0), 'INVALID_ROUTER');
    require(whitelistedRouters[router], 'ROUTER_NOT_WHITELISTED');
    
    whitelistedRouters[router] = false;
    
    // Remove from enumeration list
    uint256 index = routerListIndex[router];
    require(index > 0, 'ROUTER_NOT_IN_LIST');
    
    uint256 arrayIndex = index - 1; // Convert to 0-based index
    uint256 lastIndex = whitelistedRoutersList.length - 1;
    
    if (arrayIndex != lastIndex) {
        // Move last element to deleted position
        address lastRouter = whitelistedRoutersList[lastIndex];
        whitelistedRoutersList[arrayIndex] = lastRouter;
        routerListIndex[lastRouter] = index; // Update index for moved element
    }
    
    whitelistedRoutersList.pop();
    delete routerListIndex[router];
    
    emit RouterRemovedFromWhitelist(router, msg.sender);
}
```

#### addMultipleRoutersToWhitelist function
```solidity
/// @inheritdoc IUniswapV3Factory
function addMultipleRoutersToWhitelist(address[] calldata routers) external override {
    require(msg.sender == owner, 'NOT_OWNER');
    
    for (uint256 i = 0; i < routers.length; i++) {
        address router = routers[i];
        require(router != address(0), 'INVALID_ROUTER');
        
        if (!whitelistedRouters[router]) {
            whitelistedRouters[router] = true;
            
            // Add to enumeration list
            whitelistedRoutersList.push(router);
            routerListIndex[router] = whitelistedRoutersList.length;
            
            emit RouterWhitelisted(router, msg.sender);
        }
    }
}
```

#### removeMultipleRoutersFromWhitelist function
```solidity
/// @inheritdoc IUniswapV3Factory
function removeMultipleRoutersFromWhitelist(address[] calldata routers) external override {
    require(msg.sender == owner, 'NOT_OWNER');
    
    for (uint256 i = 0; i < routers.length; i++) {
        address router = routers[i];
        
        if (whitelistedRouters[router]) {
            whitelistedRouters[router] = false;
            
            // Remove from enumeration list
            uint256 index = routerListIndex[router];
            if (index > 0) {
                uint256 arrayIndex = index - 1;
                uint256 lastIndex = whitelistedRoutersList.length - 1;
                
                if (arrayIndex != lastIndex) {
                    address lastRouter = whitelistedRoutersList[lastIndex];
                    whitelistedRoutersList[arrayIndex] = lastRouter;
                    routerListIndex[lastRouter] = index;
                }
                
                whitelistedRoutersList.pop();
                delete routerListIndex[router];
            }
            
            emit RouterRemovedFromWhitelist(router, msg.sender);
        }
    }
}
```

#### clearRouterWhitelist function
```solidity
/// @inheritdoc IUniswapV3Factory
function clearRouterWhitelist() external override {
    require(msg.sender == owner, 'NOT_OWNER');
    
    // Clear all mappings
    for (uint256 i = 0; i < whitelistedRoutersList.length; i++) {
        address router = whitelistedRoutersList[i];
        whitelistedRouters[router] = false;
        delete routerListIndex[router];
    }
    
    // Clear the array
    delete whitelistedRoutersList;
    
    emit WhitelistCleared(msg.sender);
}
```

#### View functions
```solidity
/// @inheritdoc IUniswapV3Factory
function whitelistedRoutersCount() external view override returns (uint256) {
    return whitelistedRoutersList.length;
}

/// @inheritdoc IUniswapV3Factory
function getAllWhitelistedRouters() external view override returns (address[] memory) {
    return whitelistedRoutersList;
}
```

### 6. Pool Integration

#### Add router validation to pool contracts
```solidity
/// @notice Validates that the caller is a whitelisted router
/// @dev Should be called before processing referrer fees
modifier onlyWhitelistedRouter() {
    require(
        IUniswapV3Factory(factory).whitelistedRouters(msg.sender),
        'ROUTER_NOT_WHITELISTED'
    );
    _;
}
```

#### Modified pool swap function
```solidity
/// @inheritdoc IUniswapV3PoolActions
function swap(
    address recipient,
    bool zeroForOne,
    int256 amountSpecified,
    uint160 sqrtPriceLimitX96,
    address swapReferrer,
    bytes calldata data
) external override noDelegateCall onlyWhitelistedRouter returns (int256 amount0, int256 amount1) {
    require(amountSpecified != 0, 'AS');
    
    // ... rest of swap logic with swap referrer fee processing
}
```

#### Alternative: Conditional swap referrer fee processing
```solidity
/// @inheritdoc IUniswapV3PoolActions
function swap(
    address recipient,
    bool zeroForOne,
    int256 amountSpecified,
    uint160 sqrtPriceLimitX96,
    address swapReferrer,
    bytes calldata data
) external override noDelegateCall returns (int256 amount0, int256 amount1) {
    require(amountSpecified != 0, 'AS');
    
    // Only process swap referrer fees if called from whitelisted router
    address effectiveSwapReferrer = IUniswapV3Factory(factory).whitelistedRouters(msg.sender) 
        ? swapReferrer 
        : address(0);
    
    // ... rest of swap logic using effectiveSwapReferrer
}
```

### 7. Router Registration Process

#### Initial router registration
```solidity
// Example deployment script
function deployAndRegisterRouter() external {
    // Deploy new router
    SwapRouter router = new SwapRouter(factory, WETH9);
    
    // Register with factory
    IUniswapV3Factory(factory).addRouterToWhitelist(address(router));
    
    // Set initial swap referrer
    router.setSwapReferrer(INITIAL_SWAP_REFERRER);
}
```

#### Batch router registration
```solidity
// Register multiple routers at once
address[] memory routers = new address[](3);
routers[0] = ROUTER_V1;
routers[1] = ROUTER_V2;
routers[2] = THIRD_PARTY_ROUTER;

IUniswapV3Factory(factory).addMultipleRoutersToWhitelist(routers);
```

### 8. Security Considerations

#### Access Control - Factory Owner Only
All router whitelist functions are protected by the `require(msg.sender == owner, 'NOT_OWNER');` check:

- `addRouterToWhitelist()` - ✅ Owner only
- `removeRouterFromWhitelist()` - ✅ Owner only  
- `addMultipleRoutersToWhitelist()` - ✅ Owner only
- `removeMultipleRoutersFromWhitelist()` - ✅ Owner only
- `clearRouterWhitelist()` - ✅ Owner only
- `emergencyRemoveRouter()` - ✅ Owner only
- `pauseWhitelist()` - ✅ Owner only
- `unpauseWhitelist()` - ✅ Owner only

**View functions are public** (no access control needed):
- `whitelistedRouters()` - Public view
- `whitelistedRoutersCount()` - Public view
- `getAllWhitelistedRouters()` - Public view

#### Additional Security Features
- Pool validation prevents unauthorized swap referrer fee claims
- Proper event emission for transparency and monitoring
- Emergency procedures for rapid response to threats

#### Validation
- Prevent zero address routers
- Prevent duplicate whitelist entries
- Validate router addresses before adding
- Handle edge cases in list management

#### Gas Optimization
- Use mappings for O(1) whitelist checks
- Minimize storage operations
- Efficient array management for enumeration

### 9. Emergency Procedures

#### Emergency router removal
```solidity
// Quick removal of compromised router
function emergencyRemoveRouter(address router) external {
    require(msg.sender == owner, 'NOT_OWNER');
    require(whitelistedRouters[router], 'ROUTER_NOT_WHITELISTED');
    
    // Immediate removal
    whitelistedRouters[router] = false;
    
    // Remove from list (simplified for emergency)
    // Full cleanup can be done later
    
    emit RouterRemovedFromWhitelist(router, msg.sender);
}
```

#### Emergency whitelist pause
```solidity
/// @notice Emergency pause for router whitelist
bool public whitelistPaused;

modifier whenWhitelistNotPaused() {
    require(!whitelistPaused, 'WHITELIST_PAUSED');
    _;
}

function pauseWhitelist() external {
    require(msg.sender == owner, 'NOT_OWNER');
    whitelistPaused = true;
}

function unpauseWhitelist() external {
    require(msg.sender == owner, 'NOT_OWNER');
    whitelistPaused = false;
}
```

### 10. Testing Strategy

#### Unit Tests
- Test router whitelist addition and removal
- Test batch operations
- Test access control (only owner)
- Test edge cases (zero address, duplicates)
- Test enumeration functions

#### Integration Tests
- Test pool-factory integration
- Test router validation in pools
- Test swap referrer fee processing with whitelist
- Test emergency procedures

#### Gas Analysis
- Measure gas costs for whitelist operations
- Optimize array management
- Compare different validation approaches

### 11. Monitoring and Analytics

#### Events for Tracking
- `RouterWhitelisted`: Track router additions
- `RouterRemovedFromWhitelist`: Track router removals
- `WhitelistCleared`: Track whitelist resets

#### Query Functions
- `getAllWhitelistedRouters()`: Get all approved routers
- `whitelistedRoutersCount()`: Get whitelist size
- `whitelistedRouters[router]`: Check specific router status

#### Off-chain Integration
- Subgraph indexing of whitelist events
- Router status monitoring
- Automated alerts for whitelist changes

### 12. Migration Strategy

#### Existing Pool Compatibility
- Existing pools continue to work without router validation
- New pools can be deployed with whitelist validation
- Gradual migration path for enabling validation

#### Router Onboarding
- Document router approval process
- Provide templates for router registration
- Create governance procedures for router approval

### 13. Alternative Implementations

#### Option 1: Strict Validation (Recommended)
- All swap referrer fee processing requires whitelisted router
- Maximum security and control
- May require router updates for compliance

#### Option 2: Permissive with Warnings
- Allow non-whitelisted routers but emit warnings
- Gradual transition approach
- Less disruptive to existing integrations

#### Option 3: Configurable Validation
- Pool-level configuration for router validation
- Flexible but more complex
- Allows different pools to have different policies

### 14. Governance Integration

#### DAO Proposal Template
```solidity
// Example governance proposal for router approval
function proposeRouterWhitelisting(
    address router,
    string memory description,
    bytes memory routerValidationData
) external {
    // Governance proposal logic
    // Include router validation and community review
}
```

#### Multi-sig Router Management
- Consider multi-sig for router approval
- Separate roles for different router types
- Time delays for router removal

## Implementation Timeline

### Phase 1: Core Whitelist Implementation
1. Add storage mappings and events
2. Implement basic add/remove functions
3. Add enumeration support

### Phase 2: Batch Operations
1. Implement batch add/remove functions
2. Add emergency procedures
3. Optimize gas usage

### Phase 3: Pool Integration
1. Add router validation to pools
2. Implement referrer fee gating
3. Test integration scenarios

### Phase 4: Advanced Features
1. Add pause/unpause functionality
2. Implement monitoring tools
3. Create governance integration

### Phase 5: Testing and Deployment
1. Comprehensive testing
2. Security audits
3. Gradual rollout strategy

## Benefits of This Implementation

1. **Enhanced Security**: Prevents unauthorized swap referrer fee claims
2. **Quality Control**: Ensures only approved routers can participate
3. **Flexible Management**: Easy to add/remove routers as needed
4. **Emergency Response**: Quick removal of compromised routers
5. **Transparency**: Full event logging and enumeration support
6. **Gas Efficient**: Optimized for common operations
7. **Governance Ready**: Supports DAO-based router management

## Conclusion

This router whitelist implementation provides a robust foundation for managing approved routers in the Uniswap V3 ecosystem. It balances security, flexibility, and usability while maintaining the decentralized nature of the protocol. The implementation supports both current needs and future expansion of the router ecosystem.