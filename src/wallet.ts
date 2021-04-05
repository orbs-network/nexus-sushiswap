import { web3 } from "./network";
import { bn } from "./utils";

export class Wallet {
  static async fake(index: number = 0) {
    const accounts: string[] = await web3().eth.getAccounts();
    return this.fromAddress(accounts[index]);
  }

  static random() {
    return this.fromAddress(web3().eth.accounts.create().address);
  }

  static fromAddress(address: string) {
    return new Wallet(address);
  }

  private constructor(public address: string) {
    console.log("wallet address:", this.address);
  }

  async getBalance() {
    return bn(await web3().eth.getBalance(this.address));
  }

  setAsDefaultSigner() {
    web3().eth.defaultAccount = this.address;
  }
}
