// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./ISushiswapRouter.sol";
import "hardhat/console.sol";

// The LiquidityNexus Auto Rebalancing Contract
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
    uint256 public totalLiquidity;
    mapping(address => Account) public accounts;

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

    function ethToUsd(uint256 ethAmount) public view returns (uint256 usdAmount) {
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

    function deposit(address account) public payable onlyGovernance {
        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("price", ethToUsd(1e18));

        (uint256 amountToken, uint256 amountETH, uint256 liquidity) = _addLiquidity();

        uint256 shares;
        if (totalSupply() == 0) {
            shares = liquidity;
        } else {
            shares = liquidity.mul(totalSupply()).div(totalLiquidity);
        }

        Account storage acc = accounts[account];
        acc.usd = acc.usd.add(amountToken);
        acc.eth = acc.eth.add(amountETH);
        acc.shares = acc.shares.add(shares);

        totalLiquidity = totalLiquidity.add(liquidity);
        _mint(account, shares);
    }

    function withdraw(address payable account, uint256 shares) public onlyGovernance {
        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("price", ethToUsd(1e18));

        Account storage acc = accounts[account];
        shares = _min(shares, acc.shares);
        require(shares > 0, "0 shares");

        uint256 liquidity = shares.mul(totalLiquidity).div(totalSupply());

        (uint256 amountToken, uint256 amountETH) = _removeLiquidity(liquidity);

        uint256 usdEntry = acc.usd.mul(shares).div(acc.shares);
        uint256 ethEntry = acc.eth.mul(shares).div(acc.shares);
        (uint256 usdExit, uint256 ethExit) = _applyRebalanceStrategy(amountToken, amountETH, usdEntry, ethEntry);

        acc.usd = acc.usd.sub(usdEntry);
        acc.eth = acc.eth.sub(ethEntry);
        acc.shares = acc.shares.sub(shares);

        totalLiquidity = totalLiquidity.sub(liquidity);
        _burn(account, shares);

        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("ethExit", ethExit);
        account.transfer(ethExit);
    }

    function withdrawAll(address payable account) external onlyGovernance {
        withdraw(account, balanceOf(account));
    }

    function compoundProfits() external payable onlyGovernance {
        (, , uint256 liquidity) = _addLiquidity();
        totalLiquidity = totalLiquidity.add(liquidity);
    }

    // --- owner actions ---

    function depositCapital(uint256 amount) public onlyOwner {
        if (amount > 0) {
            IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function depositAllCapital() external onlyOwner {
        depositCapital(IERC20(USDC).balanceOf(owner()));
    }

    function withdrawFreeCapital() public onlyOwner {
        uint256 balance = IERC20(USDC).balanceOf(address(this));
        if (balance > 0) {
            IERC20(USDC).safeTransfer(owner(), balance);
        }
    }

    function emergencyLiquidate() external onlyOwner {
        // TODO exit position to free all USDC
        withdrawFreeCapital();
    }

    // withdraw all non-invested assets
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
        uint256 usdcAmount = ethToUsd(msg.value);
        require(IERC20(USDC).balanceOf(address(this)) >= usdcAmount, "not enough free capital");

        (amountToken, amountETH, liquidity) = IUniswapV2Router02(SROUTER).addLiquidityETH{value: msg.value}(
            USDC,
            usdcAmount,
            0, //TODO minimums?
            0,
            address(this),
            block.timestamp // solhint-disable-line not-rely-on-time
        );
        console.log(amountToken, amountETH, liquidity);
    }

    function _removeLiquidity(uint256 liquidity) private returns (uint256 amountToken, uint256 amountETH) {
        amountETH = IUniswapV2Router02(SROUTER).removeLiquidityETHSupportingFeeOnTransferTokens( //in case they decide to add a fee
            USDC,
            liquidity,
            0, //TODO minimums?
            0,
            address(this),
            block.timestamp // solhint-disable-line not-rely-on-time
        );
        amountToken = ethToUsd(amountETH);
        console.log(amountToken, amountETH, liquidity);
    }

    function _applyRebalanceStrategy(
        uint256 amountToken,
        uint256 amountETH,
        uint256 usdEntry,
        uint256 ethEntry
    ) private pure returns (uint256 usdExit, uint256 ethExit) {
        // TODO
        usdExit = usdEntry;
        ethExit = ethEntry;
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    // --- unrestricted ---

    receive() external payable {} // solhint-disable-line no-empty-blocks
}
