import { EmailLanguage } from '../email.types';
export declare const emailStyles: {
    paragraph: string;
    button: string;
    note: string;
    details: string;
    detailLabel: string;
    detailValue: string;
    infoBox: string;
    infoTitle: string;
    list: string;
    codeBox: string;
    alert: string;
};
export declare function renderEmailLayout(params: {
    language: EmailLanguage;
    title: string;
    children: string;
    badge?: string;
    brandName?: string;
    footer?: string;
}): string;
export declare function paragraph(content: string): string;
export declare function note(content: string): string;
export declare function button(label: string, href: string): string;
export declare function detailRows(rows: Array<{
    label: string;
    value?: string;
}>): string;
export declare function infoBox(title: string, body: string): string;
export declare function bulletList(items: string[]): string;
export declare function codeBox(code: string): string;
export declare function alertBox(content: string): string;
