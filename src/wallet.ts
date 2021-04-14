import { web3 } from "./network";
import { bn } from "./utils";

export class Wallet {
  static async fake(index: number = 0) {
    const accounts: string[] = await web3().eth.getAccounts();
    return this.fromAddress(accounts[index], `fake${index}`);
  }

  static random() {
    return this.fromAddress(web3().eth.accounts.create().address, "random");
  }

  static fromAddress(address: string, name: string) {
    return new Wallet(address, name);
  }

  private constructor(public address: string, public name: string) {
    console.log("wallet address:", this.address);
  }

  async getBalance() {
    return bn(await web3().eth.getBalance(this.address));
  }

  setAsDefaultSigner() {
    web3().eth.defaultAccount = this.address;
    console.log("default signer:", this.address);
  }
}
