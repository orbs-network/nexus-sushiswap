// SPDX-License-Identifier: MIT
// solhint-disable no-empty-blocks
pragma solidity ^0.7.6;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

abstract contract TestBase {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    constructor() payable {}

    receive() external payable {}

    function beforeEach() public virtual {
        console.log("---- beforeEach ----");
    }

    function afterEach() public virtual {
        console.log("---- afterEach ----");
    }

    function assertCloseTo(
        uint256 src,
        uint256 dst,
        uint256 delta,
        string memory message
    ) internal pure {
        require(Math.max(src, dst) - Math.min(src, dst) <= delta, message);
    }
}
