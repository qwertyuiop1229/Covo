import sys

with open('public/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip() == '</body>':
        break
    new_lines.append(line)

modal_html = """<div id="feedbackModal" class="fixed inset-0 modal-overlay flex items-center justify-center z-50 hidden p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm modal-box confirm-box animate-pop-in overflow-hidden flex flex-col" style="max-height: 90vh;">
      <div class="p-5 border-b border-gray-100 flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center flex-shrink-0 shadow-sm border border-gray-200">
          <i class="fas fa-lightbulb text-lg"></i>
        </div>
        <div>
          <h2 class="text-base font-bold text-gray-800 leading-snug">ご意見・バグ報告</h2>
          <p class="text-xs text-gray-500 mt-0.5">アプリの改善にご協力ください</p>
        </div>
      </div>
      <div class="p-5 flex-1 overflow-y-auto custom-scrollbar">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">カテゴリ</label>
            <div class="relative">
              <select id="feedbackCategory" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all appearance-none cursor-pointer text-gray-800">
                <option value="bug">バグ報告</option>
                <option value="feature">機能要望</option>
                <option value="other">その他</option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                <i class="fas fa-chevron-down text-xs"></i>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">内容 <span class="text-xs font-normal text-gray-400 ml-1">(必須)</span></label>
            <textarea id="feedbackContent" rows="5" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all resize-none text-gray-800 placeholder-gray-400" placeholder="具体的な状況やご意見をお書きください..."></textarea>
          </div>
        </div>
      </div>
      <div class="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2">
        <button onclick="window.closeFeedbackModal && window.closeFeedbackModal()" class="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all">キャンセル</button>
        <button onclick="window.submitFeedback && window.submitFeedback()" id="feedbackSubmitBtn" class="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all flex items-center justify-center min-w-[90px]">送信</button>
      </div>
    </div>
  </div>
</body>
</html>
"""

final_lines = []
in_feedback = False
for line in new_lines:
    if '<div id="feedbackModal"' in line:
        in_feedback = True
    if not in_feedback:
        final_lines.append(line)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.writelines(final_lines)
    f.write(modal_html)
print('Done appending feedback modal')
