import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import SearchBlock from "../../components/Layout/SearchBlock";
import SEO from "../../components/SEO";

export async function getServerSideProps(context) {
  return {
    props: {
      ...(await serverSideTranslations(context.locale, ["common"])),
    },
  };
}

const Container = ({ children }) => {
  return (
    <div className="content-center short-top">
      {children}
    </div>
  );
};

const AmmSearch = () => {
  return (
    <>
      <SEO
        page="AMM pool details"
        title="AMM pool details"
        description="Automated market maker pool information search"
      />
      <SearchBlock tab="amm" />
      <Container>
        <h1 className='center'>Automated market maker pool information search</h1>
      </Container>
    </>
  );
};

export default AmmSearch;