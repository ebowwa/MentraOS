/**
 * messages.ts
 *
 * This file defines constant messages that should be displayed
 * in the terminal to notify developers about new SDK releases.
 *
 * Each function generates a stylized ASCII message (banner-style)
 * that highlights the latest SDK version and provides the npm install command.
 * https://patorjk.com/software/taag/
 *
 * These messages are intended to be logged to the console or shown in
 * terminal output so developers are aware of updates in a clear
 * and visually distinct way.
 *
 *
 */

export const newSDKUpdate2 = (versionNumb: string): string => {
  return `
          ___     
         /__/:\\        ┬╔╗╔╔═╗╦ ╦  ╦ ╦╔═╗╔╦╗╔═╗╔╦╗╔═╗┬
        |  |:: \\       │║║║║╣ ║║║  ║ ║╠═╝ ║║╠═╣ ║ ║╣ │
        |  |:|: \\      o╝╚╝╚═╝╚╩╝  ╚═╝╩  ═╩╝╩ ╩ ╩ ╚═╝o  
      __|__|:|\\:\\     -------------------------------
     /__/::::| \\:\\    SDK VERSION V${versionNumb} is out!
     \\  \\:\\~~\\_\\   -------------------------------
      \\  \\:\\         npm install @mentra/sdk@latest
       \\  \\:\\        
        \\  \\:\\    
         \\__\\/    
  `;
};

export const newSDKUpdate = (versionNumb: string): string => {
  return `

 /$$      /$$ /$$$$$$$$ /$$   /$$ /$$$$$$$$ /$$$$$$$   /$$$$$$ 
| $$$    /$$$| $$_____/| $$$ | $$|__  $$__/| $$__  $$ /$$__  $$
| $$$$  /$$$$| $$      | $$$$| $$   | $$   | $$  \ $$|  $$  \  $$
| $$ $$/$$ $$| $$$$$   | $$ $$ $$   | $$   | $$$$$$$/| $$$$$$$$
| $$  $$$| $$| $$__/   | $$  $$$$   | $$   | $$__  $$| $$__  $$
| $$\  $  | $$| $$      | $$\   $$$   | $$   | $$   \ $$| $$  | $$
| $$ \/   | $$| $$$$$$$$| $$ \   $$   | $$   | $$  | $$| $$  | $$
|__/     |__/|________/|__/   \__/   |__/   |__/  |__/|__/  |__/
                                                               
┬╔╗╔╔═╗╦ ╦  ╦ ╦╔═╗╔╦╗╔═╗╔╦╗╔═╗┬
│║║║║╣ ║║║  ║ ║╠═╝ ║║╠═╣ ║ ║╣ │                                                               
o╝╚╝╚═╝╚╩╝  ╚═╝╩  ═╩╝╩ ╩ ╩ ╚═╝o 
------------------------------- 
SDK VERSION V${versionNumb} is out!     
------------------------------- 
bun install @mentra/sdk@latest   
  `;
};
