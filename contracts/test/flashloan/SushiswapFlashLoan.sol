// SPDX-License-Identifier: MIT
// solhint-disable var-name-mixedcase
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../interface/ISushiswapRouter.sol";

abstract contract SushiswapFlashLoan {
    using SafeMath for uint256;

    IUniswapV2Pair private SLP;
    address private WETH;

    constructor(address _SLP, address _WETH) {
        SLP = IUniswapV2Pair(_SLP);
        WETH = _WETH;
    }

    /**
     * 1000 pcm == 1%.
     * fn - the function to execute with the loan, for example "foo(uint256,uint256)"
     * Must transfer the repay amount at the end of the callback function.
     */
    function sushiswapFlashLoan(
        uint256 pcmToken,
        uint256 pcmETH,
        string memory fn
    ) public {
        (uint256 rToken, uint256 rETH) = sortedReserves();
        uint256 borrowToken = rToken.mul(pcmToken).div(100_000);
        uint256 borrowETH = rETH.mul(pcmETH).div(100_000);
        SLP.swap(borrowToken, borrowETH, address(this), bytes(fn));
    }

    function uniswapV2Call(
        address,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external {
        Address.functionCall(
            address(this),
            abi.encodeWithSignature(string(data), amount0, amount1),
            "sushiswap flashloan callback failed"
        );
    }

    /**
     * Borrowing and repaying with same token, fee is (borrowed / 0.997).
     * For repaying with the other token, use getAmountIn() on the router.
     */
    function getSushiswapFlashloanSameTokenReturn(uint256 borrowedAmount) public pure returns (uint256) {
        return borrowedAmount.mul(1000).div(997).add(1);
    }

    function sortedReserves() public view returns (uint256 rToken, uint256 rETH) {
        (rToken, rETH, ) = SLP.getReserves();
        if (SLP.token0() == WETH) {
            uint256 tmp = rToken;
            rToken = rETH;
            rETH = tmp;
        }
    }
}
