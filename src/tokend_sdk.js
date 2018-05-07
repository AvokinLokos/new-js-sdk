import { Api } from './api'
import { Horizon } from './horizon'
import { Wallet } from './wallet'
import { Network } from './base/network'

/**
 * TokendD Software Development Toolkit.
 *
 * @class
 */
export class TokenD {
  /**
   * Make a new TokenD SDK instance.
   *
   * @constructor
   *
   * @param {string} url TokenD backend url.
   * @param {object} [opts]
   * @param {boolean} [opts.allowHttp] Allow connecting to http servers, default: `false`. This must be set to false in production deployments!
   * @param {object} [opts.proxy] Proxy configuration. Look [axios docs](https://github.com/axios/axios#request-config) for more info
   * @param {object} [opts.httpBasicAuth] HTTP basic auth credentials. Look [axios docs](https://github.com/axios/axios#request-config) for more info.
   * @param {object} [opts.customHeaders] Custom headers for request.
   * @param {boolean} [opts.withCredentials] Indicates whether or not cross-site Access-Control requests should be made using credentials.
   * @param {string} [networkPassphrase] Network passphrase.
   */
  constructor ({ url, opts, networkPassphrase }) {
    this._api = new Api(url, opts)
    this._horizon = new Horizon(url, opts)

    if (networkPassphrase) {
      Network.use(networkPassphrase)
    }
  }

  /**
   * Horizon server instance.
   */
  get horizon () {
    return this._horizon
  }

  /**
   * API server instance.
   */
  get api () {
    return this._api
  }

  /**
   * User's wallet.
   */
  get wallet () {
    return this._wallet
  }

  /**
   * Use a wallet to sign transactions.
   *
   * @param {Wallet} wallet User's wallet.
   */
  useWallet (wallet) {
    if (!(wallet instanceof Wallet)) {
      throw new TypeError('A wallet instance expected.')
    }

    this._wallet = wallet
  }
}
