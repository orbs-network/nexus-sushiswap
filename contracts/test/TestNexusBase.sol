// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./TestBase.sol";
import "../NexusLPSushi.sol";

interface TestWETH {
    function deposit() external payable;
}

abstract contract TestNexusBase is TestBase {
    NexusLPSushi public nexus;

    uint256 public constant DEADLINE = 4102444800; // 2100-01-01
    mapping(address => address[]) public pathTo;
    address public WETH; //solhint-disable-line var-name-mixedcase
    address public USDC; //solhint-disable-line var-name-mixedcase
    uint256 public startNexusBalanceUSDC;

    constructor(NexusLPSushi uut) payable TestBase() {
        nexus = uut;
        WETH = nexus.WETH();
        USDC = nexus.USDC();
        _initPaths();
        toWETH(address(this).balance);
    }

    function beforeEach() public override {
        super.beforeEach();
        printBalances(address(this), "test balance");
        printBalances(address(nexus), "nexus balance");
        startNexusBalanceUSDC = IERC20(USDC).balanceOf(address(nexus));
    }

    function afterEach() public override {
        super.afterEach();
        printBalances(address(this), "test balance");
        printBalances(address(nexus), "nexus balance");
    }

    function printBalances(address target, string memory message) public view {
        console.log(target, message);
        console.log("ETH:", target.balance / 1 ether);
        console.log("WETH:", IERC20(WETH).balanceOf(target) / 1 ether);
        console.log("USDC:", IERC20(USDC).balanceOf(target) / 1e6);
    }

    function toWETH(uint256 amount) public {
        TestWETH(WETH).deposit{value: amount}();
    }

    function _initPaths() private {
        pathTo[USDC] = new address[](2);
        pathTo[USDC][0] = WETH;
        pathTo[USDC][1] = USDC;

        pathTo[WETH] = new address[](2);
        pathTo[WETH][0] = USDC;
        pathTo[WETH][1] = WETH;
    }
}
