import { useState, useEffect } from 'react'
import { useTranslation, Trans } from 'next-i18next'
import { useRouter } from 'next/router'
import Link from 'next/link'
import axios from 'axios'
import Image from 'next/image'
import Select from 'react-select'

import { useIsMobile } from '../utils/mobile'
import {
  server,
  devNet,
  delay,
  encode,
  networkId,
  floatToXlfHex,
  rewardRateHuman,
  encodeAddressR,
  isAddressValid,
  removeQueryParams,
  webSiteName,
  xahauNetwork
} from '../utils'
import { capitalize, duration } from '../utils/format'
import { payloadXamanPost, xamanWsConnect, xamanCancel, xamanGetSignedData } from '../utils/xaman'
import { gemwalletTxSend } from '../utils/gemwallet'

import XamanQr from './Xaman/Qr'
import CheckBox from './UI/CheckBox'
import TargetTableSelect from './UI/TargetTableSelect'
import { submitProAddressToVerify } from '../utils/pro'
import { setAvatar } from '../utils/blobVerifications'
import SetAvatar from './SignForms/SetAvatar'
import SetDomain from './SignForms/SetDomain'
import NFTokenCreateOffer from './SignForms/NFTokenCreateOffer'
import NftTransfer from './SignForms/NftTransfer'

const qr = '/images/qr.gif'
const ledger = '/images/wallets/ledger-large.svg'
const trezor = '/images/wallets/trezor-large.svg'
const ellipal = '/images/wallets/ellipal-large.svg'

const voteTxs = ['castVoteRewardDelay', 'castVoteRewardRate', 'castVoteHook', 'castVoteSeat']
const askInfoScreens = [
  ...voteTxs,
  'NFTokenAcceptOffer',
  'NFTokenCreateOffer',
  'NFTokenBurn',
  'setDomain',
  'setAvatar',
  'nftTransfer'
]
const noCheckboxScreens = [...voteTxs, 'setDomain', 'setAvatar']

export default function SignForm({ setSignRequest, account, signRequest, uuid, setRefreshPage, saveAddressData }) {
  const { t } = useTranslation()
  const router = useRouter()
  const isMobile = useIsMobile()

  const [screen, setScreen] = useState('choose-app')
  const [status, setStatus] = useState('')
  const [showXamanQr, setShowXamanQr] = useState(false)
  const [xamanQrSrc, setXamanQrSrc] = useState(qr)
  const [xamanUuid, setXamanUuid] = useState(null)
  const [expiredQr, setExpiredQr] = useState(false)
  const [agreedToRisks, setAgreedToRisks] = useState(false)
  const [formError, setFormError] = useState(false)
  const [hookData, setHookData] = useState({})
  const [seatData, setSeatData] = useState({})
  const [targetLayer, setTargetLayer] = useState(signRequest?.layer)
  const [erase, setErase] = useState(false)
  const [awaiting, setAwaiting] = useState(false)

  const [rewardRate, setRewardRate] = useState()
  const [rewardDelay, setRewardDelay] = useState()

  const [xamanUserToken, setXummUserToken] = useState(null)

  useEffect(() => {
    setXummUserToken(localStorage.getItem('xamanUserToken'))
  }, [])

  useEffect(() => {
    if (!signRequest) return
    //deeplink doesnt work on mobiles when it's not in the onClick event
    if (!isMobile) {
      txSend()
    }
    setHookData({})
    setSeatData({})
    setErase(false)
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signRequest])

  useEffect(() => {
    if (!uuid) return
    setScreen('xaman')
    setShowXamanQr(false)
    setStatus(t('signin.xumm.statuses.wait'))
    xamanGetSignedData(uuid, afterSubmit)
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid])

  const txSend = () => {
    if (signRequest?.wallet === 'xumm') {
      xamanTxSend()
    } else if (signRequest?.wallet === 'gemwallet') {
      gemwalletTxSend({ saveAddressData })
      setScreen('')
    }
  }

  const xamanTxSend = () => {
    //default login
    let tx = { TransactionType: 'SignIn' }

    if (signRequest.request) {
      tx = signRequest.request
    }
    if (signRequest.data?.signOnly) {
      //for Xaman make "SignIn" when signing only.
      tx.TransactionType = 'SignIn'
    }

    if (tx.TransactionType === 'NFTokenAcceptOffer' && !agreedToRisks && signRequest.offerAmount !== '0') {
      setScreen('NFTokenAcceptOffer')
      return
    }

    if (signRequest.action === 'nftTransfer') {
      tx.Amount = '0'
      if (!agreedToRisks) {
        setScreen('nftTransfer')
        return
      } else {
        if (!signRequest.request?.Destination) {
          setStatus(t('form.error.address-empty'))
          setFormError(true)
          return
        }
      }
    }

    if (tx.TransactionType === 'NFTokenCreateOffer' || tx.TransactionType === 'URITokenCreateSellOffer') {
      if (!agreedToRisks) {
        setScreen('NFTokenCreateOffer')
        return
      } else {
        if (signRequest.privateOffer && !signRequest.request?.Destination) {
          setStatus(t('form.error.address-empty'))
          setFormError(true)
          return
        }
        if (!signRequest.request?.Amount) {
          setStatus(t('form.error.price-empty'))
          setFormError(true)
          return
        }
      }
    }

    if (tx.TransactionType === 'NFTokenBurn' && !agreedToRisks) {
      setScreen('NFTokenBurn')
      return
    }

    if (signRequest.action === 'setDomain' && !agreedToRisks) {
      setScreen('setDomain')
      return
    }

    if (signRequest.action === 'setAvatar' && !agreedToRisks) {
      setScreen('setAvatar')
      return
    }

    if (signRequest.action && voteTxs.includes(signRequest.action) && !agreedToRisks) {
      setScreen(signRequest.action)
      return
    }

    if (signRequest.action === 'castVoteHook' && agreedToRisks && (hookData.value || erase)) {
      let hookTopic = '2' //default
      if (!hookData.topic) {
        if (hookData.topic === 0) {
          hookTopic = '0'
        }
      } else {
        hookTopic = hookData.topic
      }

      tx.HookParameters = [
        {
          HookParameter: {
            HookParameterName: '4C', // L - layer
            HookParameterValue: '0' + targetLayer // 01 for L1 table, 02 for L2 table
          }
        },
        {
          HookParameter: {
            HookParameterName: '54', // T - topic type
            HookParameterValue: '480' + hookTopic // H/48 [0x00-0x09]
          }
        },
        {
          HookParameter: {
            HookParameterName: '56', // V - vote data
            HookParameterValue: erase
              ? '0000000000000000000000000000000000000000000000000000000000000000'
              : hookData.value
          }
        }
      ]
    }

    if (signRequest.action === 'castVoteSeat' && agreedToRisks && (seatData.address || erase)) {
      tx.HookParameters = [
        {
          HookParameter: {
            HookParameterName: '4C', // L - layer
            HookParameterValue: '0' + targetLayer // 01 for L1 table, 02 for L2 table
          }
        },
        {
          HookParameter: {
            HookParameterName: '54', // T - topic type
            HookParameterValue: '53' + (seatData.seat || '13') // S - seat, seat number 0-13 (19)
          }
        },
        {
          HookParameter: {
            HookParameterName: '56', // V - vote data
            HookParameterValue: erase ? '0000000000000000000000000000000000000000' : encodeAddressR(seatData.address)
          }
        }
      ]
    }

    // add memo with domain and source tag
    if (!signRequest.data?.signOnly) {
      const client = {
        Memo: {
          MemoData: encode(server?.replace(/^https?:\/\//, ''))
        }
      }
      if (
        tx.Memos &&
        tx.Memos.length &&
        tx.Memos[0]?.Memo?.MemoData !== client.Memo.MemoData &&
        tx.Memos[1]?.Memo?.MemoData !== client.Memo.MemoData
      ) {
        tx.Memos.push(client)
      } else {
        tx.Memos = [client]
      }

      tx.SourceTag = 42697468
    }

    if (!tx.Account && account?.address) {
      tx.Account = account.address
    }

    //add network ID to transactions for xahau-testnet and xahau
    if (networkId === 21338 || networkId === 21337) {
      tx.NetworkID = networkId
    }

    let signInPayload = {
      options: {
        expire: 3
      },
      txjson: tx
    }

    if (signRequest.data?.signOnly) {
      signInPayload.options.submit = false
    }

    //for Xaman to sign transaction in the right network
    let forceNetwork = null
    if (networkId === 0) {
      forceNetwork = 'MAINNET'
    } else if (networkId === 1) {
      forceNetwork = 'TESTNET'
    } else if (networkId === 2) {
      forceNetwork = 'DEVNET'
    }
    signInPayload.options.force_network = forceNetwork
    signInPayload.custom_meta = { blob: {} }

    if (signRequest.redirect) {
      signInPayload.custom_meta.blob.redirect = signRequest.redirect
    }
    if (signRequest.broker) {
      signInPayload.custom_meta.blob.broker = signRequest.broker.name
    }
    if (signRequest.data) {
      signInPayload.custom_meta.blob.data = signRequest.data
    }

    setStatus(t('signin.xumm.statuses.wait'))

    if (isMobile) {
      setStatus(t('signin.xumm.statuses.redirecting'))
      //return to the same page
      signInPayload.options.return_url = {
        app: server + router.asPath + '?uuid={id}'
      }

      if (tx.TransactionType === 'Payment') {
        //for username receipts
        signInPayload.options.return_url.app += '&receipt=true'
      }
    } else {
      if (xamanUserToken) {
        signInPayload.user_token = xamanUserToken
      }
      setShowXamanQr(true)
    }
    payloadXamanPost(signInPayload, onPayloadResponse)
    setScreen('xaman')
  }

  const onPayloadResponse = (data) => {
    if (!data || data.error) {
      setShowXamanQr(false)
      setStatus(data.error)
      return
    }
    setXamanUuid(data.uuid)
    setXamanQrSrc(data.refs.qr_png)
    setExpiredQr(false)
    if (data.pushed) {
      setStatus(t('signin.xumm.statuses.check-push'))
    }
    if (isMobile) {
      if (data.next && data.next.always) {
        window.location = data.next.always
      } else {
        console.log('payload next.always is missing')
      }
    } else {
      setShowXamanQr(true)
      setStatus(t('signin.xumm.scan-qr'))
      //connect to xaman websocket only if it didn't redirect to the xaman app
      xamanWsConnect(data.refs.websocket_status, xamanWsConnected)
    }
  }

  const xamanWsConnected = (obj) => {
    if (obj.status === 'canceled') {
      //cancel button pressed in xaman app
      closeSignInFormAndRefresh()
    } else if (obj.opened) {
      setStatus(t('signin.xumm.statuses.check-app'))
    } else if (obj.signed) {
      setShowXamanQr(false)
      setStatus(t('signin.xumm.statuses.wait'))
      xamanGetSignedData(obj.payload_uuidv4, afterSubmit)
    } else if (obj.expires_in_seconds) {
      if (obj.expires_in_seconds <= 0) {
        setExpiredQr(true)
        setStatus(t('signin.xumm.statuses.expired'))
      }
    }
  }

  const checkTxInCrawler = async (txid, redirectName) => {
    setAwaiting(true)
    setStatus(t('signin.status.awaiting-crawler'))
    if (txid) {
      const response = await axios('xrpl/transaction/' + txid)
      if (response.data) {
        const { validated, inLedger, ledger_index, meta } = response.data
        const includedInLedger = inLedger || ledger_index
        if (validated && includedInLedger) {
          if (redirectName === 'nft') {
            //check for URI token
            for (let i = 0; i < meta.AffectedNodes.length; i++) {
              const node = meta.AffectedNodes[i]
              if (node.CreatedNode?.LedgerEntryType === 'URIToken') {
                checkCrawlerStatus({ inLedger: includedInLedger, param: node.CreatedNode.LedgerIndex })
                break
              }
            }
            return
          }
          checkCrawlerStatus({ inLedger: includedInLedger })
        } else {
          //if not validated or if no ledger info received, delay for 3 seconds
          delay(3000, closeSignInFormAndRefresh)
        }
      } else {
        //if no info on transaction, delay 3 sec
        delay(3000, closeSignInFormAndRefresh)
      }
    } else {
      //if no tx data, delay 3 sec
      delay(3000, closeSignInFormAndRefresh)
    }
  }

  const afterSubmit = async (data) => {
    /*
    {
      "application": {
        "issued_user_token": "xxx"
      },
      "response": {
        "hex": "xxx",
        "txid": "xxx",
        "environment_nodeuri": "wss://testnet.xrpl-labs.com",
        "environment_nodetype": "TESTNET",
        "account": "xxx",
        "signer": "xxx"
      }
    }
    */
    //data.payload.tx_type: "SignIn"

    if (data.custom_meta?.blob?.data?.signOnly) {
      if (data.custom_meta.blob.data?.action === 'pro-add-address') {
        //add address to the list
        submitProAddressToVerify(
          {
            address: data.custom_meta.blob.data.address,
            name: data.custom_meta.blob.data.name,
            blob: data.response.hex
          },
          (res) => {
            if (res?.error) {
              setStatus(t(res.error))
            } else {
              closeSignInFormAndRefresh()
            }
          }
        )
        return
      }

      if (data.custom_meta.blob.data?.action === 'set-avatar') {
        //add address to the list
        setAvatar(
          {
            address: data.response.account,
            blob: data.response.hex
          },
          (res) => {
            if (res?.error) {
              setStatus(t(res.error))
            } else {
              delay(3000, closeSignInFormAndRefresh)
            }
          }
        )
        return
      }
      return
    }

    const redirectName = data.custom_meta?.blob?.redirect

    if (data.response?.account) {
      saveAddressData({ address: data.response.account, wallet: 'xaman' })
      //if redirect
      if (redirectName === 'nfts') {
        window.location.href = '/nfts/' + data.response.account
        return
      } else if (redirectName === 'account') {
        window.location.href = server + '/explorer/' + data.response.account
        return
      }
    }

    //if broker, notify about the offer
    if (data.custom_meta?.blob?.broker) {
      setStatus(t('signin.status.awaiting-broker', { serviceName: data.custom_meta.blob.broker }))
      if (data.custom_meta.blob.broker === 'bidds') {
        setAwaiting(true)
        const response = await axios('/v2/bidds/transaction/broker/' + data.response.txid).catch((error) => {
          console.log(error)
          setStatus(t('signin.status.failed-broker', { serviceName: data.custom_meta.blob.broker }))
          closeSignInFormAndRefresh() //setAwaiting false inside
        })
        setAwaiting(false)
        if (response?.data) {
          /*
            {
              "status": true,
              "code": 200,
              "message": "Data Fetch Successfully",
              "data": [
                {
                  "Amount": "8880000",
                  "Destination": "rn6CYo6uSxR6fP7jWg3c8SL5jrqTc2GjCS",
                  "NFTokenID": "00081B580D828F028B88C7A78C67A2A9719DDB0A902A927EA72C172100000588",
                  "Owner": "rDzvW4ddvvDXhJNEGFWGkPQ9SYuUeMjKU5",
                  "Index": "E8E06CE995ABAA2D30AAE21725DFB4D27268F501113E4333120B6CC7E009171A",
                  "Date": "2023-11-07T10:18:31.000Z"
                }
              ]
            }
          */
          const responseData = response.data
          if (responseData.status && responseData.data?.hash) {
            // hash of the offer accept transaction
            checkTxInCrawler(responseData.data.hash, redirectName)
          } else {
            setStatus(t('signin.status.failed-broker', { serviceName: data.custom_meta.blob.broker }))
            delay(3000, closeSignInFormAndRefresh)
          }
        } else {
          setStatus(t('signin.status.failed-broker', { serviceName: data.custom_meta.blob.broker }))
          delay(3000, closeSignInFormAndRefresh)
        }
      }
      return
    }

    // For NFT transaction, lets wait for crawler to finish it's job
    if (data.payload?.tx_type.includes('NFToken') || data.payload?.tx_type.includes('URIToken')) {
      checkTxInCrawler(data.response?.txid, redirectName)
      return
    } else {
      // no checks or delays for non NFT transactions
      closeSignInFormAndRefresh()
    }
  }

  const checkCrawlerStatus = async ({ inLedger, param }) => {
    const crawlerResponse = await axios('v2/statistics/' + (xahauNetwork ? 'uritokens' : 'nftokens') + '/crawler')
    if (crawlerResponse.data) {
      const { ledgerIndex } = crawlerResponse.data
      // if crawler 10 ledgers behind, update right away
      // the backend suppose to return info directly from ledger when crawler 30 seconds behind
      // othewrwise wait until crawler catch up with the ledger where this transaction was included
      if (ledgerIndex >= inLedger || inLedger - 10 > ledgerIndex) {
        if (param) {
          signRequest.callback(param)
        }
        closeSignInFormAndRefresh()
      } else {
        //check again in 1 second if crawler ctached up with the ledger where transaction was included
        delay(1000, checkCrawlerStatus, { inLedger, param })
      }
    }
  }

  const closeSignInFormAndRefresh = () => {
    signInCancelAndClose()
    setRefreshPage(Date.now())
  }

  const signInCancelAndClose = () => {
    if (screen === 'xaman') {
      setXamanQrSrc(qr)
      xamanCancel(xamanUuid)
    }
    if (uuid) {
      removeQueryParams(router, ['uuid'])
    }
    setScreen('choose-app')
    setSignRequest(null)
    setAwaiting(false)
    setStatus('')
  }

  // temporary styles while hardware wallets are not connected
  const notAvailable = (picture, name) => {
    const divStyle = {
      display: 'inline-block',
      position: 'relative',
      opacity: 0.5,
      pointerEvents: 'none'
    }
    const spanStyle = {
      position: 'absolute',
      width: '100%',
      bottom: '20px',
      left: 0,
      textAlign: 'center',
      color: 'black'
    }
    return (
      <div style={divStyle}>
        <img alt={name} className="signin-app-logo" src={picture} />
        <span style={spanStyle}>{t('signin.not-available')}</span>
      </div>
    )
  }

  const buttonStyle = {
    margin: '0 10px'
  }

  const onRewardDelayChange = (e) => {
    setStatus('')
    let newRequest = signRequest
    let delay = e.target.value
    setRewardDelay(delay)
    delay = delay.trim()
    let n = Math.floor(Number(delay))
    if (n !== Infinity && String(n) === delay && n > 0) {
      newRequest.request.HookParameters = [
        {
          HookParameter: {
            HookParameterName: '4C', // L - layer
            HookParameterValue: '01' // 01 for L1 table, 02 for L2 table
          }
        },
        {
          HookParameter: {
            HookParameterName: '54', // T - topic type
            HookParameterValue: '5244' // RD - Reward delay
          }
        },
        {
          HookParameter: {
            HookParameterName: '56', // V - vote data
            HookParameterValue: floatToXlfHex(delay) // "0000A7DCF750D554" - 60 seconds
          }
        }
      ]
      setSignRequest(newRequest)
      setAgreedToRisks(true)
    } else {
      setStatus('Delay should be a positive integer')
      setAgreedToRisks(false)
    }
  }

  const onRewardRateChange = (e) => {
    setStatus('')
    let newRequest = signRequest
    let rate = e.target.value
    setRewardRate(rate)
    rate = rate.trim()
    if (rate >= 0 && rate <= 1) {
      newRequest.request.HookParameters = [
        {
          HookParameter: {
            HookParameterName: '4C', // L - layer
            HookParameterValue: '01' // 01 for L1 table, 02 for L2 table
          }
        },
        {
          HookParameter: {
            HookParameterName: '54', // T - topic type
            HookParameterValue: '5252' // RR - reward rate
          }
        },
        {
          HookParameter: {
            HookParameterName: '56', // V - vote data
            HookParameterValue: floatToXlfHex(rate)
          }
        }
      ]
      setSignRequest(newRequest)
      setAgreedToRisks(true)
    } else {
      setStatus('Rate should be a number from 0 to 1')
      setAgreedToRisks(false)
    }
  }

  const onSeatSelect = (data) => {
    let seatObj = seatData
    seatObj.seat = data.value
    setSeatData(seatObj)
  }

  const onSeatValueChange = (value) => {
    setStatus('')
    setAgreedToRisks(false)
    if (!value) return
    if (!isAddressValid(value)) {
      setStatus('Invalid address')
      return
    }
    setAgreedToRisks(true)
    let seatObj = seatData
    seatObj.address = value
    setSeatData(seatObj)
  }

  const onPlaceSelect = (topic) => {
    let hookObj = hookData
    hookObj.topic = topic.value
    setHookData(hookObj)
  }

  const onHookValueChange = (value) => {
    setStatus('')
    setAgreedToRisks(false)
    if (!value) return
    if (value.length !== 64) {
      setStatus('Invalid Hook value')
      return
    }
    setAgreedToRisks(true)
    let hookObj = hookData
    hookObj.value = value
    setHookData(hookObj)
  }

  const onEraseCheck = () => {
    setStatus('')
    if (!erase) {
      setAgreedToRisks(true)
    } else {
      setAgreedToRisks(false)
    }
    setErase(!erase)
  }

  const xls35Sell = signRequest?.request?.TransactionType === 'URITokenCreateSellOffer'

  const checkBoxText = (screen, signRequest) => {
    if (screen === 'nftTransfer')
      return (
        <Trans i18nKey="signin.confirm.nft-transfer">
          I'm offering that NFT for FREE to the Destination account,{' '}
          <span className="orange bold">the destination account would need to accept the NFT transfer</span>.
        </Trans>
      )

    if (screen === 'NFTokenBurn') return t('signin.confirm.nft-burn')
    if (screen === 'NFTokenCreateOffer' && (signRequest.request.Flags === 1 || xls35Sell)) {
      return t('signin.confirm.nft-create-sell-offer')
    }

    return (
      <Trans i18nKey="signin.confirm.nft-accept-offer">
        I admit that {{ webSiteName }} gives me access to a decentralised marketplace, and it cannot verify or guarantee
        the authenticity and legitimacy of any NFTs. I confirm that I've read the{' '}
        <Link href="/terms-and-conditions" target="_blank">
          Terms and conditions
        </Link>
        , and I agree with all the terms to buy, sell or use any NFTs on {{ webSiteName }}.
      </Trans>
    )
  }

  if (!screen) return ''

  return (
    <div className="sign-in-form">
      <div className="sign-in-body center">
        <div className="close-button" onClick={signInCancelAndClose}></div>
        {askInfoScreens.includes(screen) ? (
          <>
            <div className="header">
              {screen === 'NFTokenBurn' && t('signin.confirm.nft-burn-header')}
              {screen === 'NFTokenAcceptOffer' &&
                (signRequest.offerType === 'buy'
                  ? t('signin.confirm.nft-accept-buy-offer-header')
                  : t('signin.confirm.nft-accept-sell-offer-header'))}
              {screen === 'NFTokenCreateOffer' &&
                (signRequest.request.Flags === 1 || xls35Sell
                  ? t('signin.confirm.nft-create-sell-offer-header')
                  : t('signin.confirm.nft-create-buy-offer-header'))}
              {screen === 'nftTransfer' && t('signin.confirm.nft-create-transfer-offer-header')}
              {screen === 'setDomain' && t('signin.confirm.set-domain')}
              {screen === 'setAvatar' && t('signin.confirm.set-avatar')}
              {voteTxs.includes(screen) && 'Cast a vote'}
            </div>

            {screen === 'NFTokenCreateOffer' && (
              <NFTokenCreateOffer
                signRequest={signRequest}
                setSignRequest={setSignRequest}
                setStatus={setStatus}
                setFormError={setFormError}
              />
            )}

            {screen === 'nftTransfer' && (
              <NftTransfer
                signRequest={signRequest}
                setSignRequest={setSignRequest}
                setStatus={setStatus}
                setFormError={setFormError}
              />
            )}

            {screen === 'setDomain' && (
              <SetDomain
                setSignRequest={setSignRequest}
                signRequest={signRequest}
                setStatus={setStatus}
                setAgreedToRisks={setAgreedToRisks}
              />
            )}

            {screen === 'setAvatar' && (
              <SetAvatar
                setSignRequest={setSignRequest}
                signRequest={signRequest}
                setStatus={setStatus}
                setAgreedToRisks={setAgreedToRisks}
              />
            )}

            {screen === 'castVoteRewardDelay' && (
              <div className="center">
                <br />
                <span className="halv">
                  <span className="input-title">Reward delay (in seconds)</span>
                  <input
                    placeholder="2600000"
                    onChange={onRewardDelayChange}
                    className="input-text"
                    spellCheck="false"
                    value={rewardDelay}
                  />
                </span>
                <div>
                  <br />
                  {!status && rewardDelay ? <b>= {duration(t, rewardDelay, { seconds: true })}</b> : <br />}
                </div>
              </div>
            )}

            {screen === 'castVoteRewardRate' && (
              <div className="center">
                <br />
                <span className="halv">
                  <span className="input-title">
                    Reward rate (per month compounding)
                    <br />A number from 0 to 1, where 1 would be 100%
                  </span>
                  <input
                    placeholder="0.00333333333333333"
                    onChange={onRewardRateChange}
                    className="input-text"
                    spellCheck="false"
                    value={rewardRate}
                  />
                </span>
                <div>
                  <br />
                  {!status && rewardRate ? <b>≈ {rewardRateHuman(rewardRate)}</b> : <br />}
                </div>
              </div>
            )}

            {screen === 'castVoteSeat' && (
              <div className="center">
                <br />
                <div>
                  {signRequest.layer === 2 && (
                    <span className="quarter">
                      <span className="input-title">{t('signin.target-table')}</span>
                      <TargetTableSelect onChange={(layer) => setTargetLayer(layer)} layer={signRequest.layer} />
                    </span>
                  )}
                  <span className={signRequest.layer === 2 ? 'quarter' : 'halv'}>
                    <span className="input-title">Seat</span>
                    <Select
                      options={[
                        { value: '00', label: '0' },
                        { value: '01', label: '1' },
                        { value: '02', label: '2' },
                        { value: '03', label: '3' },
                        { value: '04', label: '4' },
                        { value: '05', label: '5' },
                        { value: '06', label: '6' },
                        { value: '07', label: '7' },
                        { value: '08', label: '8' },
                        { value: '09', label: '9' },
                        { value: '0A', label: '10' },
                        { value: '0B', label: '11' },
                        { value: '0C', label: '12' },
                        { value: '0D', label: '13' },
                        { value: '0E', label: '14' },
                        { value: '0F', label: '15' },
                        { value: '10', label: '16' },
                        { value: '11', label: '17' },
                        { value: '12', label: '18' },
                        { value: '13', label: '19' }
                      ]}
                      defaultValue={{ value: '13', label: '19' }}
                      onChange={onSeatSelect}
                      isSearchable={false}
                      className="simple-select"
                      classNamePrefix="react-select"
                      instanceId="seat-select"
                    />
                  </span>
                </div>

                <div className="terms-checkbox">
                  <CheckBox checked={erase} setChecked={onEraseCheck}>
                    Vacate the seat
                  </CheckBox>
                </div>

                {!erase && (
                  <span className="halv">
                    <span className="input-title">Address</span>
                    <input
                      placeholder="Enter address"
                      onChange={(e) => onSeatValueChange(e.target.value)}
                      className="input-text"
                      spellCheck="false"
                    />
                  </span>
                )}
              </div>
            )}

            {screen === 'castVoteHook' && (
              <div className="center">
                <br />
                <div>
                  {signRequest.layer === 2 && (
                    <span className="quarter">
                      <span className="input-title">{t('signin.target-table')}</span>
                      <TargetTableSelect onChange={(layer) => setTargetLayer(layer)} layer={signRequest.layer} />
                    </span>
                  )}
                  <span className={signRequest.layer === 2 ? 'quarter' : 'halv'}>
                    <span className="input-title">Place</span>
                    <Select
                      options={[
                        { value: 0, label: '0' },
                        { value: 1, label: '1' },
                        { value: 2, label: '2' },
                        { value: 3, label: '3' },
                        { value: 4, label: '4' },
                        { value: 5, label: '5' },
                        { value: 6, label: '6' },
                        { value: 7, label: '7' },
                        { value: 8, label: '8' },
                        { value: 9, label: '9' }
                      ]}
                      defaultValue={{ value: 2, label: '2' }}
                      onChange={onPlaceSelect}
                      isSearchable={false}
                      className="simple-select"
                      classNamePrefix="react-select"
                      instanceId="hook-topic-select"
                    />
                  </span>
                </div>
                <div className="terms-checkbox">
                  <CheckBox checked={erase} setChecked={onEraseCheck}>
                    Erase the hook
                  </CheckBox>
                </div>
                {!erase && (
                  <span className="halv">
                    <span className="input-title">Hook</span>
                    <input
                      placeholder="Enter hook value"
                      onChange={(e) => onHookValueChange(e.target.value)}
                      className="input-text"
                      spellCheck="false"
                    />
                  </span>
                )}
              </div>
            )}

            {!noCheckboxScreens.includes(screen) && (
              <div className="terms-checkbox">
                <CheckBox checked={agreedToRisks} setChecked={setAgreedToRisks}>
                  {checkBoxText(screen, signRequest)}
                </CheckBox>
              </div>
            )}

            <div>{status ? <b className="orange">{status}</b> : <br />}</div>

            <br />
            <button type="button" className="button-action" onClick={signInCancelAndClose} style={buttonStyle}>
              {t('button.cancel')}
            </button>
            <button
              type="button"
              className="button-action"
              onClick={xamanTxSend}
              style={buttonStyle}
              disabled={!agreedToRisks || formError}
            >
              {t('button.sign')}
            </button>
          </>
        ) : (
          <>
            {screen === 'choose-app' ? (
              <>
                <div className="header">{t('signin.choose-app')}</div>
                <div className="signin-apps">
                  <Image
                    alt="xaman"
                    className="signin-app-logo"
                    src="/images/wallets/xaman-large.svg"
                    onClick={xamanTxSend}
                    width={150}
                    height={24}
                  />
                  {signRequest?.wallet !== 'xumm' && (
                    <>
                      {!isMobile && notAvailable(ledger, 'ledger')}
                      {!isMobile && notAvailable(trezor, 'trezor')}
                      {notAvailable(ellipal, 'ellipal')}
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="header">
                  {signRequest?.request
                    ? t('signin.sign-with', { appName: capitalize(screen) })
                    : t('signin.login-with', { appName: capitalize(screen) })}
                </div>
                {screen === 'xaman' ? (
                  <>
                    {!isMobile && (
                      <div className="signin-actions-list">
                        1. {t('signin.xumm.open-app')}
                        <br />
                        {devNet ? (
                          <>
                            2. {t('signin.xumm.change-settings')}
                            <br />
                            3. {t('signin.xumm.scan-qr')}
                          </>
                        ) : (
                          <>2. {t('signin.xumm.scan-qr')}</>
                        )}
                      </div>
                    )}
                    <br />
                    {showXamanQr ? (
                      <XamanQr expiredQr={expiredQr} xamanQrSrc={xamanQrSrc} onReset={xamanTxSend} status={status} />
                    ) : (
                      <div className="orange bold center" style={{ margin: '20px' }}>
                        {awaiting && (
                          <>
                            <span className="waiting"></span>
                            <br />
                            <br />
                          </>
                        )}
                        {status}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="orange bold center" style={{ margin: '20px' }}>
                      {awaiting && (
                        <>
                          <span className="waiting"></span>
                          <br />
                          <br />
                        </>
                      )}
                      {status}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
