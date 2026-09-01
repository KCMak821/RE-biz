import { joinParts, money } from "@/lib/format";
import type { Quote } from "@/types/records";

/** The printable quotation. Layout preserved from the previous implementation. */
export function QuotePaper({ quote }: { quote: Quote }) {
  const companyContact = joinParts([quote.companySnapshot.phone, quote.companySnapshot.email]);
  const customerContact = joinParts([quote.customerSnapshot.phone, quote.customerSnapshot.email]);

  return (
    <article aria-label="報價單內容" className="quote-paper">
      <header className="quote-paper-header">
        <div>
          <h3>{quote.companySnapshot.name}</h3>
          {quote.companySnapshot.address ? <p>{quote.companySnapshot.address}</p> : null}
          {quote.companySnapshot.businessRegistration ? (
            <p>商業登記號碼：{quote.companySnapshot.businessRegistration}</p>
          ) : null}
          {companyContact ? <p>{companyContact}</p> : null}
        </div>
        <div>
          <h1>
            報價單 <small>/ QUOTATION</small>
          </h1>
          <dl>
            <div>
              <dt>報價單號</dt>
              <dd>{quote.quoteNumber}</dd>
            </div>
            <div>
              <dt>開立日期</dt>
              <dd>{quote.issueDate}</dd>
            </div>
            <div>
              <dt>有效期限</dt>
              <dd>{quote.validUntil}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="quote-bill-to">
        <span>客戶資料</span>
        <strong>{quote.customerSnapshot.companyName || quote.customerSnapshot.name}</strong>
        {quote.customerSnapshot.contact ? <p>聯絡人：{quote.customerSnapshot.contact}</p> : null}
        {quote.customerSnapshot.address ? <p>{quote.customerSnapshot.address}</p> : null}
        {customerContact ? <p>{customerContact}</p> : null}
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
          {quote.lines.map((line, index) => (
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
            <td>{money(quote.totalDiscount)}</td>
          </tr>
          <tr>
            <td colSpan={4}>總金額</td>
            <td>HKD {money(quote.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      {quote.notes ? (
        <section className="quote-paper-notes">
          <strong>備註</strong>
          <p>{quote.notes}</p>
        </section>
      ) : null}
      {quote.terms ? (
        <section className="quote-paper-notes">
          <strong>報價條款</strong>
          <p>{quote.terms}</p>
        </section>
      ) : null}
      {quote.companySnapshot.bankDetails ? (
        <section className="quote-paper-notes">
          <strong>收款銀行資料</strong>
          <p>{quote.companySnapshot.bankDetails}</p>
        </section>
      ) : null}
      <p className="quote-disclaimer">本文件為報價單，並非付款收據。</p>
    </article>
  );
}
