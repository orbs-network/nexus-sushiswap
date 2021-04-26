// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IFlashLoan.sol";

/**
 *   !!!
 *   Never keep funds permanently on your FlashLoanReceiver contract as they could be
 *   exposed to a 'griefing' attack, where the stored funds are used by an attacker.
 *   !!!
 */
abstract contract FlashLoanReceiver is IFlashLoanReceiver {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    ILendingPoolAddressesProvider private provider =
        ILendingPoolAddressesProvider(0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5);

    /**
     * callbackName - the function to execute with the loan, for example "foo()"
     */
    function takeFlashLoan(
        address asset,
        uint256 amount,
        string memory callbackName
    ) public {
        address receiverAddress = address(this);

        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);
        bytes memory params = bytes(callbackName);
        uint16 referralCode = 0;

        // TODO require(reserves >= amounts)
        LENDING_POOL().flashLoan(receiverAddress, assets, amounts, modes, onBehalfOf, params, referralCode);
    }

    /**
     * This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator, // solhint-disable-line no-unused-vars
        bytes calldata params
    ) external override returns (bool) {
        /**
         * This contract now has the funds requested.
         * Your logic goes here.
         *
         * At the end of your logic above, this contract owes
         * the flashloaned amounts + premiums.
         * Therefore ensure your contract has enough to repay
         * these amounts.
         *
         * Approve the LendingPool contract allowance to *pull* the owed amount
         */

        Address.functionCall(address(this), abi.encodeWithSignature(string(params)), "flashloan callback failed");

        for (uint256 i = 0; i < assets.length; i++) {
            uint256 amountOwing = amounts[i].add(premiums[i]);
            IERC20 asset = IERC20(assets[i]);
            require(asset.balanceOf(address(this)) >= amountOwing, "insufficient funds to repay");
            asset.safeApprove(address(LENDING_POOL()), 0);
            asset.safeApprove(address(LENDING_POOL()), amountOwing);
        }
        return true;
    }

    // solhint-disable-next-line func-name-mixedcase
    function ADDRESSES_PROVIDER() public view override returns (ILendingPoolAddressesProvider) {
        return provider;
    }

    // solhint-disable-next-line func-name-mixedcase
    function LENDING_POOL() public view override returns (ILendingPool) {
        return ILendingPool(provider.getLendingPool());
    }
}
