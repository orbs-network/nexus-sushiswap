// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks
pragma solidity ^0.7.6;

import "./TestNexusBase.sol";

contract TestSanity is TestNexusBase {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    constructor(NexusLPSushi uut) payable TestNexusBase(uut) {}

    function testPricePerFullShare() external {
        require(nexus.pricePerFullShare() == 0, "assert starts with 0");

        IERC20(WETH).safeApprove(address(nexus), 10 ether);
        nexus.addLiquidity(address(this), 10 ether, block.timestamp);
        require(nexus.pricePerFullShare() == 1 ether, "assert 100% of shares");

        IERC20(WETH).safeApprove(address(nexus), 10 ether);
        nexus.compoundProfits(10 ether, 0);
        assertCloseTo(nexus.pricePerFullShare(), 1.5 ether, 0.01 ether, "50% swapped for USDC");

        nexus.removeAllLiquidity(address(this), block.timestamp);
        require(nexus.pricePerFullShare() == 0, "assert all shares removed");
    }
}
