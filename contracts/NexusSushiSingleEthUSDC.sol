// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./ISushiswapRouter.sol";
import "hardhat/console.sol";

/**
 * The LiquidityNexus Auto Rebalancing Contract
 */
contract NexusSushiSingleEthUSDC is Ownable, ERC20("NexusSushiSingleEthUSDC", "NexusSushiSingleEthUSDC") {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Account {
        uint256 eth;
        uint256 usd;
        uint256 shares;
    }

    // --- fields ---
    address public constant WETH = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant USDC = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    address public constant SLP = address(0x397FF1542f962076d0BFE58eA045FfA2d347ACa0); // Sushiswap USDC/ETH pair
    address public constant SROUTER = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F); // Sushiswap Router2
    address public governance;
    mapping(address => Account) public accounts;
    bool public stopped = false;

    // --- events ---

    // --- modifiers ---

    modifier onlyGovernance() {
        require(governance == msg.sender, "not governance");
        _;
    }

    constructor() {
        governance = msg.sender;
        IERC20(USDC).approve(SROUTER, uint256(-1));
        IERC20(SLP).approve(SROUTER, uint256(-1));
    }

    // --- views ---

    function totalLiquidity() public view returns (uint256) {
        return IERC20(SLP).balanceOf(address(this));
    }

    // returns price in USD
    function ethPrice(uint256 ethAmount) public view returns (uint256 usdAmount) {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;
        usdAmount = IUniswapV2Router02(SROUTER).getAmountsOut(ethAmount, path)[1];
    }

    // --- gov actions ---

    function setGovernance(address _governance) external onlyGovernance {
        require(_governance != address(0), "null governance");
        governance = _governance;
    }

    function deposit(address account) public payable onlyGovernance returns (uint256 shares) {
        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("price", ethPrice(1e18));

        (uint256 amountToken, uint256 amountETH, uint256 liquidity) = _addLiquidity();

        if (totalSupply() == 0) {
            shares = liquidity;
        } else {
            shares = liquidity.mul(totalSupply()).div(totalLiquidity());
        }

        Account storage acc = accounts[account];
        acc.usd = acc.usd.add(amountToken);
        acc.eth = acc.eth.add(amountETH);
        acc.shares = acc.shares.add(shares);

        _mint(account, shares);
        if (msg.value > amountETH) {
            msg.sender.transfer(msg.value.sub(amountETH));
        }
    }

    function withdraw(address account, uint256 shares) public onlyGovernance returns (uint256 ethExit) {
        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("price", ethPrice(1e18));

        Account storage acc = accounts[account];
        shares = _min(shares, acc.shares);
        require(shares > 0, "0 shares");

        uint256 liquidity = shares.mul(totalLiquidity()).div(totalSupply());

        (uint256 amountToken, uint256 amountETH) = _removeLiquidity(liquidity);

        uint256 usdEntry = acc.usd.mul(shares).div(acc.shares);
        uint256 ethEntry = acc.eth.mul(shares).div(acc.shares);
        (, ethExit) = _applyRebalanceStrategy1(amountETH, amountToken, ethEntry, usdEntry);

        acc.usd = acc.usd.sub(usdEntry);
        acc.eth = acc.eth.sub(ethEntry);
        acc.shares = acc.shares.sub(shares);

        _burn(account, shares);

        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("ethExit", ethExit);
        msg.sender.transfer(ethExit);
    }

    function withdrawAll(address account) external onlyGovernance returns (uint256 ethExit) {
        return withdraw(account, balanceOf(account));
    }

    function compoundProfits() external payable onlyGovernance {
        // TODO swap 50% to USDC
        _addLiquidity();
    }

    // --- owner actions ---

    function depositCapital(uint256 amount) public onlyOwner {
        if (amount > 0) {
            IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function depositAllCapital() external onlyOwner {
        depositCapital(IERC20(USDC).balanceOf(msg.sender));
    }

    function withdrawFreeCapital() public onlyOwner {
        uint256 balance = IERC20(USDC).balanceOf(address(this));
        if (balance > 0) {
            IERC20(USDC).safeTransfer(msg.sender, balance);
        }
    }

    function emergencyLiquidate() external onlyOwner {
        stopped = true;
        if (totalLiquidity() > 0) {
            IUniswapV2Router02(SROUTER).removeLiquidityETHSupportingFeeOnTransferTokens( // in case of future fees
                USDC,
                totalLiquidity(),
                0,
                0,
                address(this),
                block.timestamp // solhint-disable-line not-rely-on-time
            );
        }
        withdrawFreeCapital();
    }

    /**
     * withdraw all non-investable assets
     */
    function rescueAssets(address[] memory tokens_) external onlyOwner {
        uint256 ercLen = tokens_.length;
        for (uint256 i = 0; i < ercLen; i++) {
            address token = tokens_[i];
            if (token != USDC && token != WETH) {
                uint256 balance = IERC20(token).balanceOf(address(this));
                if (balance > 0) {
                    IERC20(token).safeTransfer(owner(), balance);
                }
            }
        }
    }

    // --- internals ---

    function _addLiquidity()
        private
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        )
    {
        uint256 usdcAmount = ethPrice(msg.value); // TODO should this be quote (without the fee)?
        require(IERC20(USDC).balanceOf(address(this)) >= usdcAmount, "not enough free capital"); // TODO gracefully add or return

        (amountToken, amountETH, liquidity) = IUniswapV2Router02(SROUTER).addLiquidityETH{value: msg.value}(
            USDC,
            usdcAmount,
            0,
            0,
            address(this),
            block.timestamp // solhint-disable-line not-rely-on-time
        );
        console.log(amountToken, amountETH, liquidity);
    }

    function _removeLiquidity(uint256 liquidity) private returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) = IUniswapV2Router02(SROUTER).removeLiquidityETH(
            USDC,
            liquidity,
            0,
            0,
            address(this),
            block.timestamp // solhint-disable-line not-rely-on-time
        );
        console.log(amountToken, amountETH, liquidity);
    }

    /**
     * Rebalance usd and eth such that the eth provider takes all IL risk but receives all excess eth,
     * while usd provider's principal is protected
     */
    function _applyRebalanceStrategy1(
        uint256 amountEth,
        uint256 amountUsd,
        uint256 ethEntry, // solhint-disable-line no-unused-vars
        uint256 usdEntry
    ) private returns (uint256 ethExit, uint256 usdExit) {
        if (amountUsd > usdEntry) {
            uint256 usdDelta = amountUsd.sub(usdEntry);
            ethExit = amountEth.add(_swapUsdToEth(usdDelta));
            usdExit = usdEntry;
        } else {
            uint256 usdDelta = usdEntry.sub(amountUsd);
            uint256 ethDelta = _min(amountEth, amountEth.mul(usdDelta).div(amountUsd));
            usdExit = amountUsd.add(_swapEthToUsd(ethDelta));
            ethExit = amountEth.sub(ethDelta);
        }
    }

    /**
     * Rebalance usd and eth such that any excess eth is swapped to usd and any excess usd is swapped to eth,
     * preferring first to compensate eth provider while maintaining usd provider initial principal
     */
    function _applyRebalanceStrategy2(
        uint256 amountEth,
        uint256 amountUsd,
        uint256 ethEntry,
        uint256 usdEntry
    ) private returns (uint256 ethExit, uint256 usdExit) {
        if (amountUsd > usdEntry) {
            uint256 usdDelta = amountUsd.sub(usdEntry);
            ethExit = amountEth.add(_swapUsdToEth(usdDelta));
            usdExit = usdEntry;
        } else {
            uint256 ethDelta = amountEth.sub(ethEntry); // TODO underflow?
            usdExit = amountUsd.add(_swapEthToUsd(ethDelta));
            ethExit = ethEntry;
        }
    }

    /**
     * Rebalance usd and eth such that all IL is shared equally between eth and usd
     */
    function _applyRebalanceStrategy3(
        uint256 amountEth,
        uint256 amountUsd,
        uint256 ethEntry,
        uint256 usdEntry
    ) private view returns (uint256 ethExit, uint256 usdExit) {
        uint256 price = ethPrice(1e18); // TODO this is weird
        uint256 amountEthInUsd = amountEth.mul(price);
        uint256 ethEntryInUsd = ethEntry.mul(price);
        uint256 num = ethEntry.mul(amountUsd.add(amountEthInUsd));
        uint256 denom = usdEntry.add(ethEntryInUsd);
        ethExit = num.div(denom);
        usdExit = amountUsd.add(amountEthInUsd).sub(ethExit.mul(price));
    }

    function _swapUsdToEth(uint256 usd) private returns (uint256 eth) {
        if (usd == 0) return 0;

        address[] memory path = new address[](2);
        path[0] = USDC;
        path[1] = WETH;
        uint256[] memory amounts =
            IUniswapV2Router02(SROUTER).swapExactTokensForETH(usd, 0, path, address(this), block.timestamp); // solhint-disable-line not-rely-on-time
        eth = amounts[1];
    }

    function _swapEthToUsd(uint256 eth) private returns (uint256 usd) {
        if (eth == 0) return 0;

        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;
        uint256[] memory amounts =
            IUniswapV2Router02(SROUTER).swapExactETHForTokens{value: eth + 1_820_000}(
                0,
                path,
                address(this),
                block.timestamp
            ); // solhint-disable-line not-rely-on-time
        usd = amounts[1];
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    // --- unrestricted ---

    receive() external payable {} // solhint-disable-line no-empty-blocks
}
