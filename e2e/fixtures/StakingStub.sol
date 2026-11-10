// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// Minimal recording stub for the Tier-2 browser-wallet e2e harness.
/// Mimics the proof-bearing Staking `validatorJoin` selector and emits the ValidatorJoin
/// event (address operator, address validator, uint256 amount) the CLI decodes.
/// It also stands in for ConsensusMain, AddressManager, and
/// ValidatorWalletFactory so the SDK can resolve and verify the registration
/// domain before the browser signs the transaction.
/// It stands up NO consensus; it only records the call so the sign->broadcast
/// ->receipt loop can be asserted end to end.
contract StakingStub {
    event ValidatorJoin(address operator, address validator, uint256 amount);

    uint256 public callCount;
    address public lastOperator;
    address public lastValidator;
    uint256 public lastAmount;

    function getAddressManager() external view returns (address) {
        return address(this);
    }

    function getAddress(string calldata _name) external view returns (address) {
        if (keccak256(bytes(_name)) == keccak256("ValidatorWalletFactory")) {
            return address(this);
        }
        return address(0);
    }

    function validatorJoin(
        uint256[2] calldata _operatorPubKey,
        bytes calldata
    ) external payable returns (address) {
        address operator = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(_operatorPubKey[0], _operatorPubKey[1])
                    )
                )
            )
        );
        return _join(operator);
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
