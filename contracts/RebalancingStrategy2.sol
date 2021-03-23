// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./SushiSwapIntegration.sol";

contract RebalancingStrategy2 is SushiSwapIntegration {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /**
     * Rebalance usd and eth such that any excess eth is swapped to usd and any excess usd is swapped to eth,
     * preferring first to compensate eth provider while maintaining usd provider initial principal
     */
    function applyRebalance(
        uint256 amountEth,
        uint256 amountUsd,
        uint256 ethEntry,
        uint256 usdEntry
    ) private returns (uint256 ethExit, uint256 usdExit) {
        if (amountUsd > usdEntry) {
            uint256 usdDelta = amountUsd.sub(usdEntry);
            ethExit = amountEth.add(swapUsdToEth(usdDelta));
            usdExit = usdEntry;
        } else {
            uint256 ethDelta = amountEth.sub(ethEntry); // TODO underflow?
            usdExit = amountUsd.add(swapEthToUsd(ethDelta));
            ethExit = ethEntry;
        }
    }
}
