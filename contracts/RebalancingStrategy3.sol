// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./SushiSwapIntegration.sol";

contract RebalancingStrategy3 is SushiSwapIntegration {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /**
     * Rebalance usd and eth such that all IL is shared equally between eth and usd
     */
    function applyRebalance(
        uint256 amountEth,
        uint256 amountUsd,
        uint256 ethEntry,
        uint256 usdEntry
    ) private view returns (uint256 ethExit, uint256 usdExit) {
        uint256 price = ethToUsd(1e18); // TODO this is weird
        uint256 amountEthInUsd = amountEth.mul(price);
        uint256 ethEntryInUsd = ethEntry.mul(price);
        uint256 num = ethEntry.mul(amountUsd.add(amountEthInUsd));
        uint256 denom = usdEntry.add(ethEntryInUsd);
        ethExit = num.div(denom);
        usdExit = amountUsd.add(amountEthInUsd).sub(ethExit.mul(price));
    }
}
