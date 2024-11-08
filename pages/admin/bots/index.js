import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import SEO from '../../../components/SEO'

import { ledgerName } from '../../../utils'
import { getIsSsrMobile } from '../../../utils/mobile'
import AdminTabs from '../../../components/Tabs/AdminTabs'

export const getServerSideProps = async (context) => {
  const { locale } = context
  return {
    props: {
      isSsrMobile: getIsSsrMobile(context),
      ...(await serverSideTranslations(locale, ['common', 'admin']))
    }
  }
}

export default function Bots({ sessionToken }) {
  const { t } = useTranslation(['common', 'admin'])
  const [errorMessage, setErrorMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (!sessionToken) {
      router.push('/admin')
    } else {
      setErrorMessage('') //delete
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  return (
    <>
      <SEO title={t('header', { ns: 'admin' })} />
      <div className="page-admin content-center">
        <h1 className="center">{t('header', { ns: 'admin' })}</h1>

        <AdminTabs name="mainTabs" tab="bots" />

        <br />
        <div className="center">
          The page is under construction.
          <br />
          <br />
          Here you will be able to set up your {ledgerName} bots.
          <br />
          {errorMessage ? <div className="center orange bold">{errorMessage}</div> : <br />}
        </div>
      </div>
    </>
  )
}
