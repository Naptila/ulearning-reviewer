// ==UserScript==
// @name         优学院作业互评显示评分人名字
// @namespace    https://github.com/Naptila/ulearning-reviewer
// @version      0.0.5
// @description  让我看看是谁给我的作业打了100分？
// @author       ZM25XC itsdapi
// @match        https://www.ulearning.cn/selfwork/
// @icon         https://www.ulearning.cn/ulearning/favicon.ico
// @run-at       document-start
// @grant        unsafeWindow
// @license MIT
// ==/UserScript==

(function () {
    'use strict';
    main();

    async function main() {
        try {
            const params = getParams();
            console.log('1. 提取的参数:', params);

            const homeworkData = await getHomeworkDetail(params.homeworkid, params.studentid, params.classid, params.token);
            console.log('2. 互评作业数据:', homeworkData);

            const peerHomeworkData = await getPeerHomeworkDetail(params.homeworkid, params.studentid, params.token);
            console.log('3. 待评价任务数据:', peerHomeworkData);

            const getHomeworkData = await buildInfoList(params.homeworkid, params.classid, homeworkData, params.token);
            const getPeerHomeworkData = await buildInfoList(params.homeworkid, params.classid, peerHomeworkData, params.token);

            await showHomework(getHomeworkData);
            await showPeerHomework(getPeerHomeworkData);
        } catch (error) {
            console.error('脚本运行出错:', error);
        }
    }

    function getParams() {
        const url = (window.unsafeWindow || window).location.href;
        const match1 = /stuDetail\/([^/]+)\/([^/?]+)/.exec(url);
        const studentid = match1 ? match1[1] : '';
        const homeworkid = match1 ? match1[2] : '';

        const match2 = /[?&]ocId=([^&#]+)/.exec(url);
        const classid = match2 ? match2[1] : '';

        const tokenMatch = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
        const token = tokenMatch ? tokenMatch[1] : '';

        return {
            studentid,
            homeworkid,
            classid,
            token
        };
    }

    // 获取评价同学 userID
    async function getHomeworkDetail(homeworkid, studentid, classid, token) {
        const url = `https://homeworkapi.ulearning.cn/stuHomework/homeworkDetail/${homeworkid}/${studentid}/${classid}`;
        const result = await send(url, token);
        return result?.result?.peerReviewHomeworkList || [];
    }

    // 获取评价任务同学 userID
    async function getPeerHomeworkDetail(homeworkid, studentid, token) {
        const url = `https://homeworkapi.ulearning.cn/stuHomework/peerReviewHomeworkDatil/${homeworkid}/${studentid}`;
        const result = await send(url, token);
        return result?.result || [];
    }

    // 获取评价同学姓名和班级
    async function getInfo(homeworkid, classid, user_id, token) {
        let url = `https://homeworkapi.ulearning.cn/homework/historyStudentHomework/${user_id}/${user_id}/${homeworkid}`;
        const result = await send(url, token);

        url = `https://courseapi.ulearning.cn/classes?ocId=${classid}&pn=1&ps=9999&userId=${user_id}&keyword=&lang=zh`;
        const info = await send(url, token);

        const user = result?.result?.user || { name: '未知', studentid: '未知' };
        if (info?.list?.length) {
            user.className = info.list[0].className;
        } else {
            user.className = '未知';
        }
        return user;
    }

    async function buildInfoList(homeworkid, classid, data, token) {
        let result_list = [];
        if (!Array.isArray(data)) return result_list;
        for (let i = 0; i < data.length; i++) {
            let result = await getInfo(homeworkid, classid, data[i].userID, token);
            result_list.push(result);
        }
        return result_list;
    }

    // 轮询等待目标元素加载（最多等 15 秒）
    function waitForElement(selector, timeout = 15000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const timer = setInterval(() => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    clearInterval(timer);
                    resolve(elements);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(timer);
                    resolve([]);
                }
            }, 500);
        });
    }

    async function showHomework(info) {
        if (!info.length) return;
        await waitForElement('.peermain, .stuworkdetails-zone');

        let peerHomeworkItemEle = document.querySelectorAll('.peermain');
        if (peerHomeworkItemEle.length !== 0) {
            for (let [index, scoreWrapper] of peerHomeworkItemEle.entries()) {
                if (info[index]) {
                    scoreWrapper.insertAdjacentHTML(
                        'afterend',
                        `<div style="color: #e63946; font-weight: bold; margin: 4px 0;">评价人：${info[index].name} 学号：${info[index].studentid} 班级：${info[index].className}</div>`
                    );
                }
            }
        } else {
            let myHomeworkEle = document.querySelectorAll('.stuworkdetails-zone');
            if (myHomeworkEle.length > 0) {
                for (let _info of info) {
                    myHomeworkEle[0].insertAdjacentHTML(
                        'afterend',
                        `<div style="color: #e63946; font-weight: bold; margin: 4px 0;">等待评价：${_info.name} 学号：${_info.studentid} 班级：${_info.className}</div>`
                    );
                }
            } else {
                console.warn('未找到页面容器 (.peermain 或 .stuworkdetails-zone)，可能网页类名已更新');
            }
        }
    }

    async function showPeerHomework(info) {
        if (!info.length) return;
        const peerHomeworkEle = await waitForElement('.peer_host');
        if (peerHomeworkEle.length === 0) {
            console.warn('未找到待评价容器 (.peer_host)');
            return;
        }
        for (let [index, scoreWrapper] of peerHomeworkEle.entries()) {
            if (info[index]) {
                scoreWrapper.insertAdjacentHTML(
                    'afterend',
                    `<div style="color: #e63946; font-weight: bold; margin: 4px 0;">待评价人员：${info[index].name} 学号：${info[index].studentid} 班级：${info[index].className}</div>`
                );
            }
        }
    }

    function send(url, token) {
        const xhr = new XMLHttpRequest();
        return new Promise((res, rej) => {
            xhr.open('GET', url, true);
            xhr.setRequestHeader('AUTHORIZATION', token);
            xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    const status = xhr.status;
                    if (status === 0 || (status >= 200 && status < 400)) {
                        try {
                            res(JSON.parse(xhr.responseText));
                        } catch (e) {
                            rej(e);
                        }
                    } else {
                        rej(xhr.responseText);
                    }
                }
            };
            xhr.send();
        });
    }
})();
