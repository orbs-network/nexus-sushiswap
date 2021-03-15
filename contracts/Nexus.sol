//SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./SushiswapRouter.sol";
import "hardhat/console.sol";

contract Nexus is Ownable, ERC20("NexusEthUSDC", "NexusEthUSDC") {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // --- fields ---
    address public constant WETH = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant USDC = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    address public constant SLP = address(0x397FF1542f962076d0BFE58eA045FfA2d347ACa0); // Sushiswap USDC/ETH pair
    address public constant SROUTER = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F); // Sushiswap Router2
    address public governance;

    // --- events ---

    // --- modifiers ---

    modifier onlyGovernance() {
        require(governance == msg.sender, "Not governance");
        _;
    }

    constructor() {
        governance = msg.sender;
        IERC20(USDC).approve(SROUTER, uint256(-1)); // TODO needed?
        IERC20(USDC).approve(SLP, uint256(-1)); // TODO needed?
    }

    // --- views ---

    function ethToUsd(uint256 ethAmount) public view returns (uint256 usdAmount) {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;
        usdAmount = IUniswapV2Router02(SROUTER).getAmountsOut(ethAmount, path)[1];
    }

    // --- gov actions ---

    function setGovernance(address _governance) public onlyGovernance {
        //TODO onlyOwner?
        require(_governance != address(0), "null governance");
        governance = _governance;
    }

    fallback() external payable {}

    receive() external payable {}

    function deposit() public payable onlyGovernance {
        uint256 eth = msg.value;
        console.log("eth balance", address(this).balance);
        console.log("usd balance", IERC20(USDC).balanceOf(address(this)));
        console.log("price", ethToUsd(1e18));

        IUniswapV2Router02 router = IUniswapV2Router02(SROUTER);

        (uint256 amountToken, uint256 amountETH, uint256 liquidity) =
            router.addLiquidityETH{value: eth}(USDC, ethToUsd(eth), 0, 0, address(this), block.timestamp); //TODO minimums?
        console.log(amountToken, amountETH, liquidity);

        //        uint256 shares = ethAmount.mul(totalSupply()).div(sharesBefore);
        //        _mint(owner(), shares);
    }

    function withdraw(uint256 shares) public onlyGovernance {
        _burn(owner(), shares);
    }

    function withdrawAll() public onlyOwner onlyGovernance {
        withdraw(balanceOf(owner()));
    }

    // withdraw all non-invested assets
    function rescueAssets(address[] memory tokens_) external onlyOwner {
        uint256 ercLen = tokens_.length;
        for (uint256 i = 0; i < ercLen; i++) {
            address token = tokens_[i];
            if (token != USDC) {
                uint256 balance = IERC20(token).balanceOf(address(this));
                if (balance > 0) {
                    IERC20(token).safeTransfer(owner(), balance);
                }
            }
        }
    }

    // --- owner actions ---

    function depositCapital(uint256 amount) public onlyOwner {
        if (amount > 0) {
            IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function depositAllCapital() public onlyOwner {
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

    // ---------------------------------- mocking sushi: ----------------------------------
    uint256 public priceInUSD = 2000 * 1e6;

    function setEthPrice(uint256 _priceInUSD) public {
        priceInUSD = _priceInUSD;
    }
}
