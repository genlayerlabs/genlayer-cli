// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// Minimal recording stub for the Tier-2 browser-wallet e2e harness.
/// Mimics the Staking `validatorJoin` selectors and emits the ValidatorJoin
/// event (address operator, address validator, uint256 amount) the CLI decodes.
/// It stands up NO consensus; it only records the call so the sign->broadcast
/// ->receipt loop can be asserted end to end.
contract StakingStub {
    event ValidatorJoin(address operator, address validator, uint256 amount);

    uint256 public callCount;
    address public lastOperator;
    address public lastValidator;
    uint256 public lastAmount;

    function validatorJoin() external payable returns (address) {
        return _join(msg.sender);
    }

    function validatorJoin(address _operator) external payable returns (address) {
        return _join(_operator);
    }

    function _join(address operator) internal returns (address validator) {
        callCount += 1;
        validator = address(uint160(uint256(keccak256(abi.encodePacked(msg.sender, callCount)))));
        lastOperator = operator;
        lastValidator = validator;
        lastAmount = msg.value;
        emit ValidatorJoin(operator, validator, msg.value);
    }
}
