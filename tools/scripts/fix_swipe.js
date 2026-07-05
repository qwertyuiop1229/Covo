const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(targetPath, 'utf8');

// 1. Remove the incorrectly inserted block at mentionPopup.innerHTML = "";
const badInsertion = `mentionPopup.innerHTML = "";
        
          bubble.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
          bubble.style.transform = "translateX(0)";
          setTimeout(() => { bubble.style.transition = ""; }, 500);
          
          if (Math.abs(swipeCurrentX) > 50) {
            const msgId = bubble.dataset.messageId;
            const msgData = lastMessagesData.find(m => m.id === msgId);
            if (msgData) {
              replyingToMessage = msgData;
              replyingToNickname.textContent = msgData.senderNickname;
              replyingToText.textContent = msgData.text || (msgData.fileName ? "ファイル" : "...");
              replyingToContainer.classList.remove("hidden");
            }
          }
          const replyBg = swipeTargetRow.querySelector(".swipe-reply-icon-bg");
          if (replyBg) {
             replyBg.style.transition = "opacity 0.4s ease-out, transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
             replyBg.style.opacity = "0";
             replyBg.style.transform = "translateY(-50%) scale(0.5)";
             setTimeout(() => { replyBg.style.transition = ""; }, 500);
          }
        
        const serverMemberIds`;

const goodOriginal = `mentionPopup.innerHTML = "";
        const serverMemberIds`;

html = html.replace(badInsertion, goodOriginal);


// 2. Fix the actual swipe animation
const targetSwipe = `          bubble.style.transition = "transform 0.2s ease-out";
          bubble.style.transform = "translateX(0)";
          setTimeout(() => { bubble.style.transition = ""; }, 200);
          
          if (Math.abs(swipeCurrentX) > 50) {
            const msgId = bubble.dataset.messageId;
            const msgData = lastMessagesData.find(m => m.id === msgId);
            if (msgData) {
              replyingToMessage = msgData;
              replyingToNickname.textContent = msgData.senderNickname;
              replyingToText.textContent = msgData.text || (msgData.fileName ? "ファイル" : "...");
              replyingToContainer.classList.remove("hidden");
            }
          }
          const replyBg = swipeTargetRow.querySelector(".swipe-reply-icon-bg");
          if (replyBg) {
             replyBg.style.transition = "opacity 0.2s ease-out, transform 0.2s ease-out";
             replyBg.style.opacity = "0";
             replyBg.style.transform = "translateY(-50%) scale(0.5)";
             setTimeout(() => { replyBg.style.transition = ""; }, 200);
          }`;

const newSwipe = `          bubble.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
          bubble.style.transform = "translateX(0)";
          setTimeout(() => { bubble.style.transition = ""; }, 500);
          
          if (Math.abs(swipeCurrentX) > 50) {
            const msgId = bubble.dataset.messageId;
            const msgData = lastMessagesData.find(m => m.id === msgId);
            if (msgData) {
              replyingToMessage = msgData;
              replyingToNickname.textContent = msgData.senderNickname;
              replyingToText.textContent = msgData.text || (msgData.fileName ? "ファイル" : "...");
              replyingToContainer.classList.remove("hidden");
            }
          }
          const replyBg = swipeTargetRow.querySelector(".swipe-reply-icon-bg");
          if (replyBg) {
             replyBg.style.transition = "opacity 0.4s ease-out, transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
             replyBg.style.opacity = "0";
             replyBg.style.transform = "translateY(-50%) scale(0.5)";
             setTimeout(() => { replyBg.style.transition = ""; }, 500);
          }`;

html = html.replace(targetSwipe, newSwipe);

// 3. Add background color transition to the swipe icon during drag
// Search for replyBg.style.opacity = progress;
const targetDrag = `            replyBg.style.opacity = progress;
            replyBg.style.transform = \`translateY(-50%) scale(\${0.5 + 0.5 * progress})\`;
            if (absTx > 50) {
               replyBg.style.background = "rgba(59, 130, 246, 0.9)"; // bg-blue-500`;

const newDrag = `            replyBg.style.transition = "background-color 0.2s ease";
            replyBg.style.opacity = progress;
            replyBg.style.transform = \`translateY(-50%) scale(\${0.5 + 0.5 * progress})\`;
            if (absTx > 50) {
               replyBg.style.background = "rgba(59, 130, 246, 0.9)"; // bg-blue-500`;

html = html.replace(targetDrag, newDrag);

fs.writeFileSync(targetPath, html);
console.log('Fixed swipe logic via Node script.');
