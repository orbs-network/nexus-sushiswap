//SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract Nexus is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // --- fields ---
    address public constant USDC = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    address public sponsor;

    // --- events ---

    // --- modifiers ---
    modifier onlySponsor() {
        require(msg.sender == sponsor, "only sponsor");
        _;
    }

    constructor(address _sponsor) {
        sponsor = _sponsor;
    }

    // --- views ---

    // --- owner actions ---

    // withdraw all non-invested assets
    function rescueAssets(address[] memory tokens_) external onlyOwner {
        uint256 ercLen = tokens_.length;
        for (uint256 i = 0; i < ercLen; i++) {
            address token = tokens_[i]; // TODO all except invested funds?
            if (token != USDC) {
                uint256 balance = IERC20(token).balanceOf(address(this));
                if (balance > 0) {
                    IERC20(token).safeTransfer(owner(), balance);
                }
            }
        }
    }

    // --- sponsor actions ---

    function deposit(uint256 amount) onlySponsor {
        // TODO
    }

    function withdraw(uint256 amount) onlySponsor {
        // TODO is this needed? exiting without emergency?
    }

    function emergencyWithdraw() external onlySponsor {
        // TODO exit position to free USDC?
        uint256 balance = IERC20(USDC).balanceOf(address(this));
        IERC20(USDC).safeTransfer(sponsor, balance);
    }
}
