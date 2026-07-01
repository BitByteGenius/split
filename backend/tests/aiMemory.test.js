const { resolveReference } = require('../src/services/ai/memoryManager');

describe('ai memory follow-ups', () => {
    it('uses the last expense when the user says delete it', () => {
        const memory = {
            lastExpenseId: 'expense-123',
            lastExpense: { id: 'expense-123', title: 'Dinner' }
        };

        const result = resolveReference({ message: 'delete it', memory });

        expect(result).toMatchObject({ targetType: 'expense', targetId: 'expense-123' });
    });

    it('uses the last group when the user says use the same group', () => {
        const memory = {
            lastGroup: { id: 'group-99', name: 'Goa Trip' }
        };

        const result = resolveReference({ message: 'use the same group', memory });

        expect(result).toMatchObject({ targetType: 'group', targetId: 'group-99' });
    });
});
