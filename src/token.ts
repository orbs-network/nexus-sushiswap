import { contract } from "./extensions";
import { ERC20 } from "../typechain-hardhat/ERC20";

const abi = require("../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json").abi;

export namespace Tokens {
  export namespace eth {
    export function WETH() {
      return newToken("$WETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    }

    export function USDC() {
      return newToken("$USDC", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    }

    export function SUSHI() {
      return newToken("$SUSHI", "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2");
    }
  }

  export namespace bsc {
    export function WBNB() {
      return newToken("$WBNB", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");
    }

    export function BUSD() {
      return newToken("$BUSD", "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56");
    }
  }
}

export interface Token extends ERC20 {
  displayName: string;
  address: string;
}

export function newToken(name: string, address: string) {
  const token = contract<Token>(abi, address);
  token.displayName = name;
  token.address = address;
  return token;
}
