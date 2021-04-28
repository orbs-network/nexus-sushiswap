// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks
pragma solidity ^0.7.6;

import "./TestNexusBase.sol";

contract TestSanity is TestNexusBase {
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

    function testAvailableSpaceToDeposit() external {
        IERC20(WETH).safeApprove(address(nexus), uint256(~0));

        uint256 expected = (startNexusBalanceUSDC * 1 ether) / nexus.quote(1 ether);
        assertCloseTo(nexus.availableSpaceToDepositETH(), expected, 0.001 ether, "by ETH price in USD");

        nexus.addLiquidity(address(this), 100 ether, DEADLINE);
        assertCloseTo(nexus.availableSpaceToDepositETH(), expected - 100 ether, 0.001 ether, "by ETH price in USD");

        nexus.addLiquidity(address(this), nexus.availableSpaceToDepositETH(), DEADLINE);
        assertCloseTo(nexus.availableSpaceToDepositETH(), 0, 0.001 ether, "should be no more room");
        assertCloseTo(IERC20(USDC).balanceOf(address(nexus)), 0, 1e6, "all USDC invested");
    }
}
