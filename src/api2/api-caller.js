import axios from 'axios'

import { Network, TransactionBuilder, Transaction } from '../base'
import { Wallet } from '../wallet'
import middlewares from './middlewares'
import { toCamelCaseDeep } from '../utils/case_converter'
import { isEmpty } from 'lodash'

/**
 * @typedef {import('../base/operations/base_operation').BaseOperation} BaseOperation
 * @typedef {import('../wallet').Wallet} Wallet
 */

const SUBMIT_TRANSACTION_TIMEOUT = 60 * 10000

const methods = Object.freeze({
  PATCH: 'PATCH',
  POST: 'POST',
  PUT: 'PUT',
  GET: 'GET',
  DELETE: 'DELETE'
})

/**
 * Represents ApiCaller that performs requests to TokenD servers
 *
 * @see {@link https://docs.tokend.io}
 * @see {@link /docs/README.md}
 */
export class ApiCaller {
  /**
   * Creates an `ApiCaller` instance
   *
   * @param {object} opts
   * @param {AxiosInstance} opts.axios - axios instance to use
   * @param {string} opts.baseURL - URL to a Horizon server to use
   *
   * @param {Wallet} [opts.wallet] - the initialized {@link Wallet} instance for
   * signing requests and transactions
   * @param {string} [opts.passphrase] - the passphrase of current TokenD
   * network (is used internally when signing transactions)
   */
  constructor (opts = {}) {
    this._axios = axios.create()
    if (opts.baseURL) {
      this.useBaseURL(opts.baseURL)
    }

    this._wallet = null
    this._networkDetails = {}
    this._customTimeout = null
    this._clockDiff = 0

    if (opts.wallet) {
      this.useWallet(opts.wallet)
    }

    if (opts.passphrase) {
      this.usePassphrase(opts.passphrase)
    }
  }

  /**
   * Returns a copy of the current instance but with a new wallet provided.
   * Use if you want to perform an operation with the same environment
   * config but another wallet should be used
   *
   * @example
   * await api.withWallet(newWallet).postOperations(operation)
   *
   * @param {Wallet} wallet - new wallet to use
   * @returns {ApiCaller} - Copy of the current instance but with a new wallet
   */
  withWallet (wallet) {
    const newCaller = Object.assign(Object.create(Object.getPrototypeOf(this)), this)
    newCaller.useWallet(wallet)
    return newCaller
  }

  /**
   * Creates an `ApiCaller` instance with the provided `baseURL` set as default
   * Horizon server endpoint. It also * required network passphrase and wallet
   * provided to authorize transactions * and requests. Also check for
   * `usePassphrase()`, `useWallet()` and * `getInstanceWithPassphrase()`
   *
   * @param {string} baseURL - URL to a Horizon server to use
   * @returns {ApiCaller} - The initialized API caller instance
   */
  static getInstance (baseURL) {
    return new ApiCaller({
      baseURL
    })
  }

  withBaseURL (baseURL) {
    const newCaller = Object.assign(Object.create(Object.getPrototypeOf(this)), this)
    newCaller.useBaseURL(baseURL)
    return newCaller
  }

  /**
   * Creates an `ApiCaller` instance with the provided `baseURL` set as default
   * Horizon server endpoint but also * retrieves and sets network passphrase.
   * Fetches and assigns network details. * Check also for `networkDetails`
   * getter.
   *
   * @param {string} baseURL - URL to a Horizon server to use
   * @returns {ApiCaller} - The initialized API caller instance
   */
  static async getInstanceWithPassphrase (baseURL) {
    const caller = this.getInstance(baseURL)
    const { data: networkDetails } = await caller.getRaw('/')

    caller.useNetworkDetails(networkDetails)

    return caller
  }

  /**
   * Returns network details fetched from Horizon’s root.
   *
   * @returns {Object} - Object with network details
   */
  get networkDetails () {
    return this._networkDetails
  }

  /**
   * Returns current wallet
   *
   * @returns {Wallet}
   */
  get wallet () {
    return this._wallet
  }

  /**
   * Makes a `GET` to a target `endpoint` with the provided `query` params.
   * Signing can be enabled with `needSign` argument. Parses the response in
   * JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} query - query params. query parameters should not contain
   * no more than 1 level of nesting.
   * @param {boolean} [needSign=false] - set `true` to sign the request, also
   * check for `.getWithSignature()`
   * @returns {Object} - the parsed response.
   */
  get (endpoint, query, needSign = false) {
    return this.call({
      method: methods.GET,
      needSign,
      endpoint,
      query,
      isEmptyBodyAllowed: true
    })
  }

  /**
   * Makes a `GET` to a target `endpoint` with the provided `query` params.
   * _Cannot_ sign request. _Does_ not parse the * response
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} query - query params. query parameters should not contain
   * no more than 1 level of nesting.
   * @returns {Object} - the response.
   */
  getRaw (endpoint, query) {
    return this.call({
      method: methods.GET,
      needRaw: true,
      endpoint,
      query
    })
  }

  /**
   * Makes a `GET` to a target `endpoint` with the provided `query` params.
   * Signs the request. Parses the response in JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} query - query params. query parameters should not contain
   * no more than 1 level of nesting.
   * @returns {Object} - the parsed response.
   */
  getWithSignature (endpoint, query) {
    return this.get(endpoint, query, true)
  }

  /**
   * Makes a `POST` to a target `endpoint` with the provided `data` as body.
   * Signing can be enabled with `needSign` argument. Parses the response in
   * JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @param {boolean} [needSign=false] - set `true` to sign the request, also
   * check for `.postWithSignature()`
   * @returns {Object} - the parsed response.
   */
  post (endpoint, data, needSign = false) {
    return this.call({
      method: methods.POST,
      needSign,
      endpoint,
      data
    })
  }

  /**
   * Makes a `POST` to a target `endpoint` with the provided `data` as body.
   * Signs the request. Parses the response in JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @returns {Object} - the parsed response.
   */
  postWithSignature (endpoint, data) {
    return this.post(endpoint, data, true)
  }

  /**
   * Makes a `PATCH` to a target `endpoint` with the provided `data` as body.
   * Signing can be enabled with `needSign` argument. Parses the response in
   * JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @param {boolean} [needSign=false] - set `true` to sign the request, also
   * check for `.patchWithSignature()`
   * @returns {Object} - the parsed response.
   */
  patch (endpoint, data, needSign = false) {
    return this.call({
      method: methods.PATCH,
      needSign,
      endpoint,
      data
    })
  }

  /**
   * Makes a `PATCH` to a target `endpoint` with the provided `data` as body.
   * Signs the request. Parses the response in JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @returns {Object} - the parsed response.
   */
  patchWithSignature (endpoint, data) {
    return this.patch(endpoint, data, true)
  }

  /**
   * Makes a `PUT` to a target `endpoint` with the provided `data` as body.
   * Signing can be enabled with `needSign` argument. Parses the response in
   * JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @param {boolean} [needSign=false] - set `true` to sign the request, also
   * check for `.putWithSignature()`
   * @returns {Object} - the parsed response.
   */
  put (endpoint, data, needSign = false) {
    return this.call({
      method: methods.PUT,
      needSign,
      endpoint,
      data
    })
  }

  /**
   * Makes a `PUT` to a target `endpoint` with the provided `data` as body.
   * Signs the request. Parses the response in JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @returns {Object} - the parsed response.
   */
  putWithSignature (endpoint, data) {
    return this.put(endpoint, data, true)
  }

  /**
   * Makes a `DELETE` to a target `endpoint` with the provided `data` as body.
   * Signing can be enabled with `needSign` argument. Parses the response in
   * JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @param {boolean} [needSign=false] - set `true` to sign the request, also
   * check for `.deleteWithSignature()`
   * @returns {Object} - the parsed response.
   */
  delete (endpoint, data, needSign = false) {
    return this.call({
      method: methods.DELETE,
      needSign,
      endpoint,
      data,
      isEmptyBodyAllowed: true
    })
  }

  /**
   * Makes a `DELETE` to a target `endpoint` with the provided `data` as body.
   * Signs the request. Parses the response in JsonApi format.
   *
   * @param {string} endpoint - target endpoint _with_ starting slash
   * @param {object} data - body to include
   * @returns {Object} - the parsed response.
   */
  deleteWithSignature (endpoint, data) {
    return this.delete(endpoint, data, true)
  }

  /**
   * Crafts a transaction envelope with the provided operations, signs it and
   * makes the post request with the envelope
   *
   * @see {@link BaseOperation}
   * @param {...BaseOperation} operations - operations to be included.
   * @returns {Promise} - Promise with response, keys data will be camel cased,
   * does not do any other actions on the response
   */
  postOperations (...operations) {
    return this.postOperationsParametrized({}, ...operations)
  }

  /**
   * Crafts a transaction envelope with the provided operations, signs it and
   * makes the post request to a specific endpoint with the envelope.
   *
   * @param {object} prm - request configuration
   * @param {string} [prm.endpoint=/v3/transactions]
   * Endpoint to send the transaction
   * @param {boolean} [prm.needSignRequest=false]
   * Set `true` to sign the request. Do not be confused with the transaction
   * signature, which is performed inevitably.
   * @param {boolean} [prm.waitForIngest=true]
   * Set 'false' to skip the horizon ingestion. Thus the response is
   * received right after the transaction is sent to the node.
   * @param {boolean} [prm.jsonApi=false]
   * Set 'true' to wrap the request body in `data` object.
   *
   * @param {...BaseOperation} operations - operations to be included.
   * @see {@link BaseOperation}
   *
   * @returns {Promise} - Promise with response, keys data will be camel cased,
   * does not do any other actions on the response
   */
  postOperationsParametrized (prm, ...operations) {
    if (!prm || typeof prm !== 'object') {
      throw new TypeError('`prm` should be a valid object!')
    }

    return this.postTxEnvelope(
      this.getTransaction(...operations),
      prm.waitForIngest === undefined ? true : prm.waitForIngest,
      prm.endpoint === undefined ? '/v3/transactions' : prm.endpoint,
      prm.needSignRequest === undefined ? false : prm.needSignRequest,
      prm.jsonApi === undefined ? false : prm.jsonApi
    )
  }

  getTransaction (...operations) {
    if (!this._wallet) {
      throw new ReferenceError('No wallet found to sign the transaction')
    }
    return new TransactionBuilder(this._wallet.accountId)
      .addOperations(operations)
      .addSigner(this._wallet.keypair)
      .build()
      .toEnvelope()
      .toXDR()
      .toString('base64')
  }

  getBuildedTransaction (operations, opts = {}) {
    return new TransactionBuilder(this._wallet.accountId, opts)
      .addOperations(operations)
      .addSigner(this._wallet.keypair)
      .build()
  }

  signAndSendTransaction (tx, waitForIngest = true, endpoint = `/v3/transactions`) {
    const envelopeTx = this.signTransaction(tx)

    return this.postTxEnvelope(envelopeTx, waitForIngest, endpoint)
  }

  signTransaction (tx) {
    if (!this._wallet) {
      throw new Error('No wallet found to sign the transaction')
    }

    const transaction = new Transaction(tx)
    transaction.sign(this._wallet.keypair)
    const envelopeTx = transaction
      .toEnvelope()
      .toXDR()
      .toString('base64')

    return envelopeTx
  }

  /**
   * Posts a transaction envelope.
   *
   * @param {string} envelope - a transaction envelope to be submitted.
   * @param {boolean} [waitForIngest=true] - set 'false' to skip ingest
   * @param {string} [endpoint=/v3/transactions] - target endpoint
   * @param {boolean} [needSignRequest=false] - sign the request (not the tx)
   * @param {boolean} [jsonApi=false] - wrap the body for JSON API compliance
   * @returns {Promise} - Promise with response, keys data will be camel cased,
   * does not do any other actions on the response
   */
  async postTxEnvelope (
    envelope,
    waitForIngest = true,
    endpoint = `/v3/transactions`,
    needSignRequest = false,
    jsonApi = false
  ) {
    const attributes = {
      tx: envelope,
      wait_for_ingest: waitForIngest
    }

    // using raw axios because we don't need most of middleware, but need custom
    // request timeout here
    let config = {
      baseURL: this._baseURL,
      timeout: SUBMIT_TRANSACTION_TIMEOUT,
      data: jsonApi ? { data: { attributes } } : attributes,
      method: methods.POST,
      url: this._ensureEndpoint(endpoint),
      headers: {},
      withCredentials: needSignRequest,
      maxContentLength: 100000000000,
      maxBodyLength: 1000000000000
    }
    config.headers = middlewares.setJsonapiHeaders(config)

    if (needSignRequest) {
      if (!this._wallet || !this._wallet.keypair || !this._wallet.accountId) {
        throw new ReferenceError('Signature requested, but no wallet found to sign the request')
      }
      config.headers = middlewares.signRequest(config, this._wallet.keypair,
        this._wallet.accountId)
    }

    let response
    try {
      response = await this._axios(config)
    } catch (e) {
      throw middlewares.parseJsonapiError(e)
    }

    return {
      // the response is not in JSON API format, but the error is
      data: toCamelCaseDeep(response.data)
    }
  }

  /**
   * Performs a request
   *
   * @param {object} opts
   * @param {string} opts.method - the http method of request
   * @param {string} [opts.endpoint] - endpoint where to make the call to, e.g. '/v3/accounts'
   * @param {string} [opts.baseURL] - overwrite the default base url, e.g. 'https://api.tokend.io/'
   * @param {object} [opts.data] - request data (for POST/PUT requests)
   * @param {object} [opts.query] - request query params. See {@link parseQuery} for details
   * @param {object} [opts.headers] - request headers
   * @param {string} [opts.contentType] - contentType header, `application/vnd.api+json` by default
   * @param {boolean} [opts.withCredentials=true] - set false to skip cookies
   * @param {boolean} [opts.needSign=false] - defines if will try to sign the request, `false` by default
   * @param {boolean} [opts.needRaw=false] - defines if raw response should be returned, `false` by default
   * @param {boolean} [opts.isEmptyBodyAllowed=false] - defines if empty body is allowed, `false` by default
   */
  async call (opts) {
    let config = {
      baseURL: opts.baseURL || this._baseURL,
      url: this._ensureEndpoint(opts.endpoint),
      method: opts.method,
      params: opts.query || {},
      paramsSerializer: function (params) {
        return Object.entries(params)
          .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
          .join('&')
      },
      data: (opts.isEmptyBodyAllowed && !opts.data)
        ? undefined
        : opts.data || {},
      headers: opts.headers || {},
      withCredentials: opts.withCredentials === undefined
        ? true
        : opts.withCredentials,
      maxContentLength: 100000000000,
      maxBodyLength: 1000000000000
    }

    config.params = middlewares.flattenToAxiosJsonApiQuery(config)
    config.headers = middlewares.setJsonapiHeaders(config)

    if (opts.contentType) {
      config.headers['Content-Type'] = opts.contentType
    }

    if (this._customTimeout) {
      config.timeout = this._customTimeout
    }

    if (opts.needSign) {
      if (!this._wallet || !this._wallet.keypair || !this._wallet.accountId) {
        throw new ReferenceError('Signature requested, but no wallet found to sign the request')
      }
      config.headers = middlewares.signRequest(config, this._wallet.keypair,
        this._wallet.accountId)
    }

    let response

    try {
      response = await this._axios(config)
    } catch (e) {
      throw middlewares.parseJsonapiError(e, this._axios)
    }

    if (!opts.needRaw) {
      response = middlewares.parseJsonapiResponse(response)

      if (!isEmpty(response.links)) {
        if (opts.needSign) {
          response.makeLinkCallersWithSignature(this)
        } else {
          response.makeLinkCallers(this)
        }
      }
    } else {
      response = toCamelCaseDeep(response)
    }

    return response
  }

  /**
   * Use a wallet to sign requests and transactions.
   *
   * @param {Wallet} wallet - A wallet to use
   * @see {@link /docs/README.md#wallets}
   */
  useWallet (wallet) {
    if (!(wallet instanceof Wallet)) {
      throw new TypeError('A wallet instance expected.')
    }

    this._wallet = wallet
  }

  /**
   * Use a passphrase to sign transactions.
   *
   * @param {Wallet} wallet - A wallet to use
   * @see {@link /docs/README.md#wallets}
   */
  usePassphrase (networkPassphrase) {
    Network.use(new Network(networkPassphrase))
  }

  /**
   * Assigns new baseURL to the current instance.
   *
   * @param {string} baseURL - URL to horizon server
   */
  useBaseURL (baseURL) {
    this._baseURL = baseURL
  }

  /**
   * Assigns new network details to the instance. Network details can be
   * retrieved by calling root endpoint of you horizon, for example:
   * https://api.your.tokend.io/
   *
   * @param {Object} networkDetails - network details to use
   */
  useNetworkDetails (networkDetails) {
    this._networkDetails = networkDetails
    this.usePassphrase(networkDetails.networkPassphrase)
  }

  _ensureEndpoint (endpoint = '') {
    if (endpoint && !endpoint.startsWith('/')) {
      throw new TypeError(`ApiCaller: endpoint should start with "/", got ${endpoint}`)
    }
    return endpoint
  }
}
