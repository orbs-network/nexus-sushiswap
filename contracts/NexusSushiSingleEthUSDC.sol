// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./LiquidityNexusBase.sol";
import "./SushiSwapIntegration.sol";
import "./RebalancingStrategy1.sol";
import "./NexusUniswapV2ERC20.sol";

/**
 * The LiquidityNexus Auto Rebalancing Contract
 */
contract NexusSushiSingleEthUSDC is NexusUniswapV2ERC20, RebalancingStrategy1 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint public constant MINIMUM_LIQUIDITY = 10**3;

    address public constant token0 = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48); // USDC
    address public constant token1 = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2); // WETH

    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);

    struct OriginalMinter {
        uint256 eth;
        uint256 usd;
        uint256 liquidity;
    }

    uint256 public totalLiquidity;
    uint256 public totalInvestedUSD;
    uint256 public totalInvestedETH;
    mapping(address => OriginalMinter) public originalMinters;

    /**
     * assumes approval of deposited tokens
     */
    function addLiquidityETH(
        uint amountETHMin,
        address to,
        uint deadline
    )
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint amountToken, uint amountETH, uint liquidity)
    {
        // TODO safeTransferFrom
        // TODO always supply more USDC than ETH when adding liquidity, revery in case leftover ETH (which means not enough USDC)
        (amountToken, amountETH, liquidity) = _addLiquidity(amountETHMin, deadline);

        totalInvestedUSD = totalInvestedUSD.add(amountToken);
        totalInvestedETH = totalInvestedETH.add(amountETH);

        OriginalMinter storage acc = originalMinters[to];
        acc.usd = acc.usd.add(amountToken);
        acc.eth = acc.eth.add(amountETH);
        acc.liquidity = acc.liquidity.add(liquidity);

        _mint(to, liquidity);
        if (msg.value > amountETH) {
            msg.sender.transfer(msg.value.sub(amountETH));
        }
    }

    function removeLiquidityETH(
        uint liquidity,
        uint amountETHMin,
        address payable to,
        uint deadline
    )
        public
        nonReentrant
        whenNotPaused
        returns (uint amountToken, uint amountETH)
    {
        OriginalMinter storage acc = originalMinters[msg.sender];
        liquidity = Math.min(liquidity, acc.liquidity);
        require(liquidity > 0, "sender is not found in the original minters list");

        (uint256 amountToken, uint256 amountETH) = _removeLiquidity(liquidity, amountETHMin, deadline);

        uint256 usdEntry = acc.usd.mul(liquidity).div(acc.liquidity);
        uint256 ethEntry = acc.eth.mul(liquidity).div(acc.liquidity);
        (uint256 ethExit, uint256 usdExit) = applyRebalance(amountETH, amountToken, ethEntry, usdEntry);

        acc.usd = acc.usd.sub(usdEntry);
        acc.eth = acc.eth.sub(ethEntry);
        acc.liquidity = acc.liquidity.sub(liquidity);

        _burn(msg.sender, liquidity);
        totalInvestedUSD = totalInvestedUSD.sub(usdEntry);
        totalInvestedETH = totalInvestedETH.sub(ethEntry);

        to.transfer(ethExit);
    }

    function removeAllLiquidityETH(uint amountETHMin, address payable to, uint deadline)
        external
        returns (uint amountToken, uint amountETH)
    {
        return removeLiquidityETH(balanceOf[msg.sender], amountETHMin, to, deadline);
    }

    function emergencyLiquidate() external onlyOwner {
        removeLiquiditySupportingFee(totalLiquidity);
        totalLiquidity = 0;
        withdrawFreeCapital();
        totalInvestedUSD = 0;
    }
}
