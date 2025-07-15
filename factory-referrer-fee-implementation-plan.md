# UniswapV3Factory Referrer Fee Implementation Plan

## Overview
This document outlines the changes required to the UniswapV3Factory contract to support referrer fee functionality. The factory will manage referrer fee configurations for pools, similar to how it currently manages protocol fees.

## Current Factory Structure Analysis

### Existing Functionality
The UniswapV3Factory contract currently:
- Manages pool creation and deployment
- Controls factory ownership
- Manages fee amount and tick spacing configurations
- Provides pool lookup functionality

### Current Owner Capabilities
The factory owner can:
- Change factory ownership (`setOwner`)
- Enable new fee amounts (`enableFeeAmount`)
- Set protocol fees on pools (via pool's `setFeeProtocol`)

## Proposed Referrer Fee Management

### 1. Storage Additions

#### Add referrer fee configuration mapping
```solidity
/// @dev Mapping from pool address to referrer fee configuration
/// Uses same format as protocol fees: feeReferrer0 + (feeReferrer1 << 4)
mapping(address => uint8) public poolReferrerFees;
```

#### Add default referrer fee configuration
```solidity
/// @dev Default referrer fee configuration for newly created pools
/// Uses same format as protocol fees: feeReferrer0 + (feeReferrer1 << 4)
/// Can be 0 (no referrer fees) or values between 4-20 (1/4 to 1/20 of swap fee)
uint8 public defaultReferrerFee;
```

### 2. Interface Updates

#### Add to IUniswapV3Factory.sol
```solidity
/// @notice Emitted when the default referrer fee is changed
/// @param oldDefaultReferrerFee The previous default referrer fee
/// @param newDefaultReferrerFee The new default referrer fee
event DefaultReferrerFeeChanged(uint8 oldDefaultReferrerFee, uint8 newDefaultReferrerFee);

/// @notice Emitted when a pool's referrer fee is set
/// @param pool The pool address
/// @param feeReferrer0Old The previous referrer fee for token0
/// @param feeReferrer1Old The previous referrer fee for token1
/// @param feeReferrer0New The new referrer fee for token0
/// @param feeReferrer1New The new referrer fee for token1
event PoolReferrerFeeSet(
    address indexed pool,
    uint8 feeReferrer0Old,
    uint8 feeReferrer1Old,
    uint8 feeReferrer0New,
    uint8 feeReferrer1New
);

/// @notice Returns the default referrer fee for newly created pools
/// @return The default referrer fee configuration
function defaultReferrerFee() external view returns (uint8);

/// @notice Returns the referrer fee configuration for a specific pool
/// @param pool The pool address
/// @return The referrer fee configuration (feeReferrer0 + (feeReferrer1 << 4))
function poolReferrerFees(address pool) external view returns (uint8);

/// @notice Sets the default referrer fee for newly created pools
/// @dev Can only be called by the factory owner
/// @param _defaultReferrerFee The new default referrer fee
function setDefaultReferrerFee(uint8 _defaultReferrerFee) external;

/// @notice Sets the referrer fee for a specific pool
/// @dev Can only be called by the factory owner
/// @param pool The pool address
/// @param feeReferrer0 The referrer fee for token0 (0 or 4-20)
/// @param feeReferrer1 The referrer fee for token1 (0 or 4-20)
function setPoolReferrerFee(address pool, uint8 feeReferrer0, uint8 feeReferrer1) external;
```

### 3. Implementation Functions

#### setDefaultReferrerFee function
```solidity
/// @inheritdoc IUniswapV3Factory
function setDefaultReferrerFee(uint8 _defaultReferrerFee) external override {
    require(msg.sender == owner, 'NOT_OWNER');
    require(
        _defaultReferrerFee == 0 || (_defaultReferrerFee >= 4 && _defaultReferrerFee <= 20),
        'INVALID_REFERRER_FEE'
    );
    
    uint8 oldDefaultReferrerFee = defaultReferrerFee;
    defaultReferrerFee = _defaultReferrerFee;
    
    emit DefaultReferrerFeeChanged(oldDefaultReferrerFee, _defaultReferrerFee);
}
```

#### setPoolReferrerFee function
```solidity
/// @inheritdoc IUniswapV3Factory
function setPoolReferrerFee(
    address pool,
    uint8 feeReferrer0,
    uint8 feeReferrer1
) external override {
    require(msg.sender == owner, 'NOT_OWNER');
    require(pool != address(0), 'INVALID_POOL');
    require(
        (feeReferrer0 == 0 || (feeReferrer0 >= 4 && feeReferrer0 <= 20)) &&
        (feeReferrer1 == 0 || (feeReferrer1 >= 4 && feeReferrer1 <= 20)),
        'INVALID_REFERRER_FEE'
    );
    
    uint8 currentFee = poolReferrerFees[pool];
    uint8 feeReferrer0Old = currentFee % 16;
    uint8 feeReferrer1Old = currentFee >> 4;
    
    poolReferrerFees[pool] = feeReferrer0 + (feeReferrer1 << 4);
    
    // Update the pool's referrer fee configuration
    IUniswapV3Pool(pool).setFeeReferrer(feeReferrer0, feeReferrer1);
    
    emit PoolReferrerFeeSet(pool, feeReferrer0Old, feeReferrer1Old, feeReferrer0, feeReferrer1);
}
```

#### Helper function to get referrer fee breakdown
```solidity
/// @notice Returns the referrer fee breakdown for a specific pool
/// @param pool The pool address
/// @return feeReferrer0 The referrer fee for token0
/// @return feeReferrer1 The referrer fee for token1
function getPoolReferrerFees(address pool) external view returns (uint8 feeReferrer0, uint8 feeReferrer1) {
    uint8 fees = poolReferrerFees[pool];
    feeReferrer0 = fees % 16;
    feeReferrer1 = fees >> 4;
}
```

### 4. Pool Creation Integration

#### Modify createPool function
```solidity
/// @inheritdoc IUniswapV3Factory
function createPool(
    address tokenA,
    address tokenB,
    uint24 fee
) external override noDelegateCall returns (address pool) {
    require(tokenA != tokenB);
    (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0));
    int24 tickSpacing = feeAmountTickSpacing[fee];
    require(tickSpacing != 0);
    require(getPool[token0][token1][fee] == address(0));
    
    pool = deploy(address(this), token0, token1, fee, tickSpacing);
    getPool[token0][token1][fee] = pool;
    getPool[token1][token0][fee] = pool;
    
    // Set default referrer fee for the new pool
    if (defaultReferrerFee > 0) {
        poolReferrerFees[pool] = defaultReferrerFee;
        uint8 feeReferrer0 = defaultReferrerFee % 16;
        uint8 feeReferrer1 = defaultReferrerFee >> 4;
        IUniswapV3Pool(pool).setFeeReferrer(feeReferrer0, feeReferrer1);
    }
    
    emit PoolCreated(token0, token1, fee, tickSpacing, pool);
}
```

### 5. Batch Operations Support

#### Batch set referrer fees for multiple pools
```solidity
/// @notice Sets referrer fees for multiple pools in a single transaction
/// @dev Can only be called by the factory owner
/// @param pools Array of pool addresses
/// @param feeReferrer0s Array of referrer fees for token0
/// @param feeReferrer1s Array of referrer fees for token1
function batchSetPoolReferrerFees(
    address[] calldata pools,
    uint8[] calldata feeReferrer0s,
    uint8[] calldata feeReferrer1s
) external {
    require(msg.sender == owner, 'NOT_OWNER');
    require(
        pools.length == feeReferrer0s.length && pools.length == feeReferrer1s.length,
        'ARRAY_LENGTH_MISMATCH'
    );
    
    for (uint256 i = 0; i < pools.length; i++) {
        setPoolReferrerFee(pools[i], feeReferrer0s[i], feeReferrer1s[i]);
    }
}
```

### 6. Migration and Upgrade Support

#### Initialize referrer fees for existing pools
```solidity
/// @notice Initializes referrer fees for existing pools
/// @dev One-time function to set referrer fees for pools created before this upgrade
/// @param pools Array of existing pool addresses
/// @param referrerFee The referrer fee to set for all pools
function initializeExistingPoolReferrerFees(
    address[] calldata pools,
    uint8 referrerFee
) external {
    require(msg.sender == owner, 'NOT_OWNER');
    require(referrerFee == 0 || (referrerFee >= 4 && referrerFee <= 20), 'INVALID_REFERRER_FEE');
    
    for (uint256 i = 0; i < pools.length; i++) {
        address pool = pools[i];
        require(pool != address(0), 'INVALID_POOL');
        
        // Only initialize if not already set
        if (poolReferrerFees[pool] == 0) {
            poolReferrerFees[pool] = referrerFee + (referrerFee << 4);
            IUniswapV3Pool(pool).setFeeReferrer(referrerFee, referrerFee);
            
            emit PoolReferrerFeeSet(pool, 0, 0, referrerFee, referrerFee);
        }
    }
}
```

## Implementation Steps

### Phase 1: Interface Updates
1. Add new events to `IUniswapV3Factory.sol`
2. Add new functions to `IUniswapV3Factory.sol`
3. Update interface documentation

### Phase 2: Storage Implementation
1. Add `poolReferrerFees` mapping
2. Add `defaultReferrerFee` variable
3. Update constructor if needed

### Phase 3: Core Functions
1. Implement `setDefaultReferrerFee()`
2. Implement `setPoolReferrerFee()`
3. Implement `getPoolReferrerFees()` helper
4. Add input validation and access control

### Phase 4: Pool Creation Integration
1. Modify `createPool()` to set default referrer fees
2. Ensure proper initialization of new pools

### Phase 5: Batch Operations
1. Implement `batchSetPoolReferrerFees()`
2. Implement `initializeExistingPoolReferrerFees()`

### Phase 6: Testing and Validation
1. Unit tests for all new functions
2. Integration tests with pool creation
3. Access control tests
4. Edge case validation

## Security Considerations

### 1. Access Control
- Only factory owner can set referrer fees
- Proper validation of owner permissions
- Consider multi-sig requirements for production

### 2. Input Validation
- Referrer fees must be 0 or between 4-20 (1/4 to 1/20 of swap fee)
- Pool addresses must be valid
- Array lengths must match for batch operations

### 3. State Management
- Proper storage of referrer fee configurations
- Consistent state between factory and pools
- Handle edge cases for uninitialized pools

### 4. Upgrade Safety
- Backwards compatibility for existing pools
- Safe migration path for fee configuration
- Proper event emission for tracking changes

## Gas Optimization

### 1. Storage Efficiency
- Pack referrer fees into single uint8 (4 bits each)
- Use mappings for efficient lookups
- Minimize storage operations

### 2. Batch Operations
- Support batch setting to reduce transaction costs
- Optimize loops for gas efficiency
- Consider gas limits for large batches

### 3. View Functions
- Efficient getter functions
- Minimal external calls
- Optimized data structures

## Integration with Pool Contract

### Pool Interface Requirements
The pool contract must implement:
```solidity
function setFeeReferrer(uint8 feeReferrer0, uint8 feeReferrer1) external;
```

### Factory-Pool Communication
- Factory calls pool's `setFeeReferrer()` during configuration
- Pool validates that caller is factory
- Proper error handling for failed calls

## Configuration Examples

### Example 1: Set 5% referrer fee (1/20 of swap fee)
```solidity
factory.setDefaultReferrerFee(20); // 1/20 = 5%
```

### Example 2: Set different fees for token0 and token1
```solidity
factory.setPoolReferrerFee(poolAddress, 10, 20); // 1/10 and 1/20
```

### Example 3: Disable referrer fees
```solidity
factory.setPoolReferrerFee(poolAddress, 0, 0); // No referrer fees
```

## Backward Compatibility

- Existing pools continue to work without referrer fees
- New pools can be created with default referrer fees
- Migration tools provided for existing pool upgrades
- No breaking changes to existing interfaces

## Monitoring and Analytics

### Events for Tracking
- `DefaultReferrerFeeChanged`: Track default fee changes
- `PoolReferrerFeeSet`: Track individual pool configurations
- Integration with existing pool events

### Query Functions
- `poolReferrerFees()`: Get current pool configuration
- `getPoolReferrerFees()`: Get breakdown of fees
- `defaultReferrerFee()`: Get default configuration

## Conclusion

This implementation plan provides a comprehensive approach to adding referrer fee management to the UniswapV3Factory contract. The design maintains consistency with existing protocol fee patterns while providing flexibility for different referrer fee configurations across pools.

The factory-based approach ensures:
- Centralized management of referrer fees
- Consistent configuration across pools
- Easy migration and upgrade paths
- Proper access control and validation
- Gas-efficient operations