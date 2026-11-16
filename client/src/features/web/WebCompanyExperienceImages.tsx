import {type ComponentProps} from 'react';
import WebCategorizedImages, {CategorizedImagesView,type Language} from './WebCategorizedImages';
const categories=[['projectContract','Contrato','Contract'],['bidWinningNotice','Adjudicación','Award notice'],['projectAcceptanceCertificate','Acta de aceptación','Acceptance certificate'],['paymentInvoice','Factura','Invoice']] as const;
const imagePath=(projectId:string)=>`/api/company-experience/${encodeURIComponent(projectId)}/images`;
type Props=Omit<ComponentProps<typeof CategorizedImagesView>,'path'|'categories'> & {projectId:string};
export function ExperienceImagesView({projectId,...props}:Props){return <CategorizedImagesView {...props} path={imagePath(projectId)} categories={categories}/>;}
export default function WebCompanyExperienceImages({projectId,language,disabled=false}:{projectId:string;language:Language;disabled?:boolean}){return <WebCategorizedImages language={language} path={imagePath(projectId)} categories={categories} title={['Soportes','Supporting images']} disabled={disabled}/>;}
