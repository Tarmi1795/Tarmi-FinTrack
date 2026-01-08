
import React, { useRef } from 'react';
import { Modal } from './ui/Modal';
import { Receivable, AppState } from '../types';
import { format } from 'date-fns';
import { Printer, Share2 } from 'lucide-react';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Receivable;
  appState: AppState;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, data, appState }) => {
  const profile = appState.businessProfile;
  const party = appState.parties.find(e => e.name === data.partyName);
  
  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
      const text = `Hello ${data.partyName},\nHere is your invoice for ${data.notes || 'services'}.\nAmount: ${data.currency || 'QAR'} ${data.originalAmount || data.amount}\nDue Date: ${format(new Date(data.dueDate), 'yyyy-MM-dd')}\n\nThank you,\n${profile.name}`;
      const url = `https://wa.me/${party?.phone?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
  }

  // Fallback to today if issueDate is missing (legacy data)
  const displayDate = data.issueDate ? new Date(data.issueDate) : new Date();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invoice Preview">
      <div className="flex justify-end gap-2 mb-4 no-print">
         <button onClick={handleWhatsApp} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
             <Share2 size={16} /> WhatsApp
         </button>
         <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
             <Printer size={16} /> Print / PDF
         </button>
      </div>

      <div id="invoice-area" className="bg-white text-black p-8 rounded-lg shadow-lg max-w-2xl mx-auto min-h-[600px] flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-100 pb-6 mb-6">
              <div>
                  <h1 className="text-3xl font-bold text-gray-800">{profile.name}</h1>
                  <div className="text-sm text-gray-500 mt-2 space-y-1">
                      <p>{profile.address}</p>
                      <p>{profile.phone}</p>
                      <p>{profile.email}</p>
                  </div>
              </div>
              <div className="text-right">
                  <h2 className="text-4xl font-light text-gray-300 uppercase tracking-widest">Invoice</h2>
                  <p className="font-mono text-gray-600 mt-2">#{data.id.substr(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-gray-500 mt-1">Date: {format(displayDate, 'MMM d, yyyy')}</p>
                  <p className="text-sm text-gray-500">Due: <span className="font-semibold text-red-500">{format(new Date(data.dueDate), 'MMM d, yyyy')}</span></p>
              </div>
          </div>

          {/* Bill To */}
          <div className="mb-8">
              <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Bill To</h3>
              <h4 className="text-xl font-bold text-gray-800">{data.partyName}</h4>
              {party && (
                  <div className="text-sm text-gray-500 mt-1">
                      {party.address && <p>{party.address}</p>}
                      {party.phone && <p>{party.phone}</p>}
                      {party.email && <p>{party.email}</p>}
                  </div>
              )}
          </div>

          {/* Table */}
          <div className="flex-1">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-gray-50 border-y border-gray-200">
                        <th className="py-3 px-4 text-sm font-semibold text-gray-600">Description</th>
                        <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody className="text-sm text-gray-700">
                    <tr className="border-b border-gray-100">
                        <td className="py-4 px-4">{data.notes || 'Service Fee / Product Purchase'}</td>
                        <td className="py-4 px-4 text-right font-medium">
                            {data.currency || 'QAR'} {(data.originalAmount || data.amount).toLocaleString()}
                        </td>
                    </tr>
                </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="border-t-2 border-gray-100 pt-4 mt-8 flex justify-end">
              <div className="text-right">
                  <p className="text-sm text-gray-500 mb-1">Total Due</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {data.currency || 'QAR'} {(data.originalAmount || data.amount).toLocaleString()}
                  </p>
              </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-100 text-center">
              <p className="text-sm font-medium text-gray-600">{profile.name}</p>
              <p className="text-xs text-gray-400 mt-1">{profile.footerNote || 'Thank you for your business.'}</p>
          </div>
      </div>
    </Modal>
  );
};
