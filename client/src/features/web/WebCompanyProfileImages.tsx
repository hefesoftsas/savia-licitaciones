import {type ComponentProps} from 'react';
import WebCategorizedImages, {CategorizedImagesView,type Language} from './WebCategorizedImages';
const categories=[
 ['officeEnvironment','Oficinas','Offices'],
 ['businessLicense','Licencia comercial','Business license'],
 ['legalRepresentativeIdEmblem','ID representante legal (reverso)','Legal representative ID (back)'],
 ['legalRepresentativeIdPortrait','ID representante legal (anverso)','Legal representative ID (front)'],
 ['legalRepresentativeAuthorization','Autorización del representante legal','Legal representative authorization'],
 ['authorizedRepresentativeIdEmblem','ID autorizado (reverso)','Authorized representative ID (back)'],
 ['authorizedRepresentativeIdPortrait','ID autorizado (anverso)','Authorized representative ID (front)'],
 ['basicDepositAccountInfo','Información de cuenta básica','Basic account information'],
 ['creditChinaReport','Informe CreditChina','CreditChina report'],
 ['governmentProcurementRecord','Consulta de sanciones','Procurement sanctions record'],
 ['enterpriseCreditReport','Informe de crédito empresarial','Company credit report'],
 ['dishonestEnforcementQuery','Consulta de morosos','Enforcement record'],
 ['taxCertificate','Certificado tributario','Tax certificate'],
 ['auditReport','Informe de auditoría','Audit report'],
 ['socialSecurityCertificate','Certificado de seguridad social','Social security certificate'],
 ['bankAccountLicense','Licencia de cuenta bancaria','Bank account license'],
] as const;
const path='/api/company-profile/images';
type Props=Omit<ComponentProps<typeof CategorizedImagesView>,'path'|'categories'>;
export function ProfileImagesView(props:Props){return <CategorizedImagesView {...props} path={path} categories={categories}/>;}
export default function WebCompanyProfileImages({language,embedded=false}:{language:Language;embedded?:boolean}){return <WebCategorizedImages language={language} path={path} categories={categories} title={['Imágenes de la empresa','Company images']} embedded={embedded}/>;}
