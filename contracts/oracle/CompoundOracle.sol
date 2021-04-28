// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface ICompoundOracle {
    function price(string memory symbol) external view returns (uint256);
}

contract CompoundOracle {
    address private constant COMPOUND_ORACLE = address(0x922018674c12a7F0D394ebEEf9B58F186CdE13c1);

    /**
     * returns price of ETH in USD (6 decimals)
     */
    function compoundPriceETHUSD() public view returns (uint256) {
        return ICompoundOracle(COMPOUND_ORACLE).price("ETH");
    }
}
