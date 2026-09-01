import { joinParts, money } from "@/lib/format";
import type { Invoice } from "@/types/records";

/** The printable invoice. Layout preserved from the previous implementation. */
export function InvoicePaper({ currency, invoice }: { currency: string; invoice: Invoice }) {
  const companyContact = joinParts([invoice.companySnapshot.phone, invoice.companySnapshot.email]);

  return (
    <article aria-label="請款單內容" className="quote-paper">
      <header className="quote-paper-header">
        <div>
          <h3>{invoice.companySnapshot.name}</h3>
          {invoice.companySnapshot.address ? <p>{invoice.companySnapshot.address}</p> : null}
          {invoice.companySnapshot.businessRegistration ? (
            <p>商業登記號碼：{invoice.companySnapshot.businessRegistration}</p>
          ) : null}
          {companyContact ? <p>{companyContact}</p> : null}
        </div>
        <div>
          <h1>
            請款單 <small>/ INVOICE</small>
          </h1>
          <dl>
            <div>
              <dt>請款單號</dt>
              <dd>{invoice.invoiceNumber}</dd>
            </div>
            <div>
              <dt>開立日期</dt>
              <dd>{invoice.issueDate}</dd>
            </div>
            <div>
              <dt>付款到期日</dt>
              <dd>{invoice.dueDate}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="quote-bill-to">
        <span>請款對象</span>
        <strong>{invoice.customerSnapshot.companyName || invoice.customerSnapshot.name}</strong>
        {invoice.customerSnapshot.contact ? <p>聯絡人：{invoice.customerSnapshot.contact}</p> : null}
        {invoice.customerSnapshot.address ? <p>{invoice.customerSnapshot.address}</p> : null}
        {invoice.sourceQuoteNumber ? <p>來源報價單：{invoice.sourceQuoteNumber}</p> : null}
      </section>

      <table className="quote-paper-table">
        <thead>
          <tr>
            <th>項目／服務</th>
            <th>數量</th>
            <th>單價</th>
            <th>折扣</th>
            <th>小計</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, index) => (
            <tr key={index}>
              <td>
                <strong>{line.name}</strong>
                {line.description ? <small>{line.description}</small> : null}
              </td>
              <td>{line.quantity}</td>
              <td>{money(line.unitPrice)}</td>
              <td>{money(line.discountAmount)}</td>
              <td>{money(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>總折扣</td>
            <td>{money(invoice.totalDiscount)}</td>
          </tr>
          <tr>
            <td colSpan={4}>應付總額</td>
            <td>
              {currency} {money(invoice.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      {invoice.companySnapshot.bankDetails ? (
        <section className="quote-paper-notes">
          <strong>付款資料</strong>
          <p>{invoice.companySnapshot.bankDetails}</p>
        </section>
      ) : null}
      {invoice.notes ? (
        <section className="quote-paper-notes">
          <strong>備註</strong>
          <p>{invoice.notes}</p>
        </section>
      ) : null}
      {invoice.terms ? (
        <section className="quote-paper-notes">
          <strong>付款條款</strong>
          <p>{invoice.terms}</p>
        </section>
      ) : null}
      <p className="quote-disclaimer">本文件為商業請款單／付款通知，並非政府統一發票或付款收據。</p>
    </article>
  );
}
