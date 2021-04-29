// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./ChainlinkOracle.sol";
import "./CompoundOracle.sol";

contract PriceGuard is ChainlinkOracle, CompoundOracle {
    enum Oracle {Off, Chainlink, Compound}

    uint256 public constant MAX_SPREAD_PCM = 10_000; //10%

    Oracle public selectedOracle = Oracle.Chainlink;

    modifier verifyPriceOracle(uint256 priceETHUSD) {
        if (selectedOracle != Oracle.Off) {
            uint256 oraclePrice = selectedOracle == Oracle.Chainlink ? chainlinkPriceETHUSD() : compoundPriceETHUSD();
            uint256 min = Math.min(priceETHUSD, oraclePrice);
            uint256 max = Math.max(priceETHUSD, oraclePrice);
            uint256 upperLimit = (min * (MAX_SPREAD_PCM + 100_000)) / 100_000;
            require(max <= upperLimit, "PriceGuard ETHUSD");
        }
        _;
    }

    function _setPriceGuardOracle(Oracle oracle) internal {
        selectedOracle = oracle;
    }
}
