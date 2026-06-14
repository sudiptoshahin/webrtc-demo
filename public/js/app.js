
var AppProcess = (function () {
    var peerConnectionIds = [];
    var peerConnections = [];
    var remoteVideoStream = [];
    var remoteAudioStream = [];
    var serverProcess;
    var localDiv;
    var my_connection_id;
    var audio;
    var isAudioMute = true;
    var rtpAudioSenders = [];
    var rtpVideoSenders = [];
    var videoStates = {
        None: 0,
        Camera: 1
    };
    var video_st = videoStates.None;
    var videoCamTrack;

    //  signaling config
    const configuration = {
        iceServers: [
            {
                urls: [
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302'
                ]
            }
        ]
    };


    async function _init(SDP_function, myConnectionId) {
        serverProcess = SDP_function;
        my_connection_id = myConnectionId;

        eventProcess();
        localDiv = document.getElementById("localVideoPlayer");
    }

    async function eventProcess() {
        $('#micMuteUnmute').on('click', async function () {
            if (!audio) {
                await loadAudio();
            }
            if (!audio) {
                alert("Audio permission not granted");
                return;
            }
            if (isAudioMute) {
                audio.enabled = true;
                $(this).html("<span class='material-icons' style='width: 100%;'>mic</span>");
                updateMediaSenders(audio, rtpAudioSenders);
            } else {
                audio.enabled = false;
                $(this).html("<span class='material-icons' style='width: 100%;'>mic_off</span>");
                removeMediaSenders(rtpAudioSenders);
            }
            isAudioMute = !isAudioMute;
        });

        //  VIDEO FUNCTIONALITY
        $("#videoCamOnOff").on('click', async () => {
            if (video_st == videoStates.Camera) {
                await videoProcess(videoStates.None);
            } else {
                await videoProcess(videoStates.Camera);
            }
        });

    }

    async function loadAudio() {
        try {
            var audioStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            audio = audioStream.getAudioTracks()[0];
            audio.enabled = false;
        } catch (e) {
            console.log(e);
        }
    }

    function connection_status(connection) {
        if (connection && (connection.connectionState === 'new'
            || connection.connectionState === 'connecting'
            || connection.connectionState === 'connected')) {
            return true;
        }
        return false;
    }

    async function updateMediaSenders(track, rtpSenders) {
        for (var connectionId in peerConnectionIds) {
            console.log('updateMediaSenders:peerConnections[connectionId])=> ', peerConnections[connectionId]);

            if (connection_status(peerConnections[connectionId])) {
                if (rtpSenders[connectionId] && rtpSenders[connectionId].track) {
                    rtpSenders[connectionId].replaceTrack(track);
                } else {
                    rtpSenders[connectionId] = peerConnections[connectionId].addTrack(track);
                }
            }
        }

    }

    function removeMediaSenders(rtpSenders) {
        for (var connectionId in peerConnectionIds) {
            if (rtpSenders[connectionId] && connection_status(peerConnections[connectionId])) {
                peerConnections[connectionId].removeTrack(rtpSenders[connectionId]);
            }
        }
    }

    function removeVideoStream(rtpVideoSenders) {
        if (videoCamTrack) {
            videoCamTrack.stop();
            videoCamTrack = null;
            localDiv.srcObject = null;
            removeMediaSenders(rtpVideoSenders);
        }
    }

    async function videoProcess(newVideoState) {

        if (newVideoState === videoStates.None) {
            $('#videoCamOnOff').html("<span class='material-icons' style='width: 100%;'>videocam_off</span>");
            video_st = newVideoState;
            // remove video
            removeVideoStream(rtpVideoSenders);
            return;
        }
        if (newVideoState === videoStates.Camera) {
            $('#videoCamOnOff').html("<span class='material-icons' style='width: 100%;'>videocam_on</span>")
        }

        try {
            var videoStream = null;
            if (newVideoState == videoStates.Camera) {
                videoStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 1920,
                        height: 1080
                    },
                    audio: false
                });
            }

            if (videoStream && videoStream.getVideoTracks().length > 0) {
                videoCamTrack = videoStream.getVideoTracks()[0];
                if (videoCamTrack) {
                    localDiv.srcObject = new MediaStream([videoCamTrack]);
                    updateMediaSenders(videoCamTrack, rtpVideoSenders);
                }
            }

        } catch (e) {
            console.log(e);
            return;
        }

        video_st = newVideoState;

    }

    async function setOffer(connectionId) {
        var connection = peerConnections[connectionId];
        var offer = await connection.createOffer();
        await connection.setLocalDescription(offer);

        serverProcess(JSON.stringify({
            offer: connection.localDescription
        }), connectionId);

    }

    async function SDPProcess(message, fromConnectionId) {
        message = JSON.parse(message);
        if (message.answer) {
            await peerConnections[fromConnectionId].setRemoteDescription(
                new RTCSessionDescription(message.answer)
            );
            // var offer = await peerConnections[fromConnectionId].createOffer();
            // await peerConnections[fromConnectionId].setLocalDescription(offer);

        } else if (message.offer) {
            if (!peerConnections[fromConnectionId]) {
                await setConnection(fromConnectionId);
            }
            await peerConnections[fromConnectionId].setRemoteDescription(new RTCSessionDescription(message.offer));
            var answer = await peerConnections[fromConnectionId].createAnswer();
            await peerConnections[fromConnectionId].setLocalDescription(answer);
            serverProcess(
                JSON.stringify({
                    answer: answer,
                }),
                fromConnectionId
            );
        } else if (message.iceCandidate) {
            if (!peerConnections[fromConnectionId]) {
                await setConnection(fromConnectionId)
            }
            try {
                await peerConnections[fromConnectionId].addIceCandidate(message.iceCandidate);
            } catch (e) {
                console.log(e);
            }
        }
    }

    async function setConnection(connectionId) {
        var connection = new RTCPeerConnection(configuration);

        connection.onnegotiationneeded = async (event) => {
            await setOffer(connectionId);
        }

        // process for establishing a connection between peers
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                serverProcess(JSON.stringify({ iceCandidate: event.candidate }), connectionId);

                console.log(
                    'onicecandidate:serverProcess=>', 
                    JSON.stringify({ iceCandidate: event.candidate }), connectionId
                )
            }
        }

        //  handle incomming tracks
        connection.ontrack = (event) => {

            console.log(
                'ontrack:event=> ',
                event
            );

            if (!remoteVideoStream[connectionId]) {
                remoteVideoStream[connectionId] = new MediaStream();
            }
            if (!remoteAudioStream[connectionId]) {
                remoteAudioStream[connectionId] = new MediaStream();
            }

            if (event.track.kind == 'video') {
                remoteVideoStream[connectionId].getVideoTracks()
                    .forEach(track => {
                        remoteVideoStream[connectionId].removeTrack(track);
                    });
                remoteVideoStream[connectionId].addTrack(event.track);

                // adding track to video player
                var remoteVideoPlayer = document.getElementById('v_' + connectionId);
                remoteVideoPlayer.srcObject = null;
                remoteVideoPlayer.srcObject = remoteVideoStream[connectionId];
                // The load() method is used to update the video element after 
                // changing the source or other settings.
                remoteVideoPlayer.load();
            } else if (event.track.kind === 'audio') {
                remoteAudioStream[connectionId].getAudioTracks()
                    .forEach(track => {
                        remoteAudioStream[connectionId].removeTrack(track);
                    });
                remoteAudioStream[connectionId].addTrack(event.track);

                var remoteAudioPlayer = document.getElementById('a_' + connectionId);
                remoteAudioPlayer.srcObject = null;
                remoteAudioPlayer.srcObject = remoteAudioStream[connectionId];

                remoteAudioPlayer.load();
            }
        }

        peerConnectionIds[connectionId] = connectionId;
        peerConnections[connectionId] = connection;

        if (video_st === videoStates.Camera) {
            updateMediaSenders(videoCamTrack, rtpVideoSenders);
        }

        return connection;
    }

    return {
        setNewConnection: async function (connectionId) {
            await setConnection(connectionId);
        },
        init: async function (SDP_function, myConnectionId) {
            await _init(SDP_function, myConnectionId);
        },
        processClientFunction: async (data, fromConnectionId) => {
            await SDPProcess(data, fromConnectionId);
        }
    };
})();

var MyApp = (function () {

    var socket = null;
    var userId = "";
    var meetingId = "";

    function init(uid, mid) {
        userId = uid;
        meetingId = mid;

        $("#meetingContainer").show();
        $("#me h2").text(userId + "(Me)");
        document.title = userId;

        eventProcessForSignalingServer();
    }

    function eventProcessForSignalingServer() {
        socket = io.connect('http://127.0.0.1:3000');

        var SDP_function = (data, toConnectionId) => {
            socket.emit("SDPProcess", {
                message: data,
                toConnectionId: toConnectionId
            });
        };

        socket.on("connect", () => {

            if (socket.connected) {
                AppProcess.init(SDP_function, socket.id);

                if (userId != "" && meetingId != "") {

                    socket.emit("userconnect", {
                        displayName: userId,
                        meetingId: meetingId
                    });
                }
            }
        });

        // INFORM OTHER USERS ABOUT ME
        socket.on("inform_others_about_me", function (data) {
            addUser(data.otherUserId, data.connectionId);
            AppProcess.setNewConnection(data.connectionId);
        });

        //  INFORM ME ABOUT OTHER USERS
        socket.on("inform_me_about_other_user", (otherUsers) => {
            if (otherUsers) {
                for (var i = 0; i < otherUsers.length; i++) {
                    addUser(otherUsers[i].userId, otherUsers[i].connectionId);
                    AppProcess.setNewConnection(otherUsers[i].connectionId);
                }
            }
        });

        socket.on("SDPProcess", async (data) => {
            console.log('on: SDPProcess:data=> ', data);
            await AppProcess.processClientFunction(data.message, data.fromConnectionId);
        });
    }

    function addUser(otherUserId, connectionId) {
        var newDivId = $("#otherTemplate").clone();
        newDivId = newDivId.attr("id", connectionId).addClass("other");
        newDivId.find("h2").text(otherUserId);
        newDivId.find("video").attr("id", "v_" + connectionId);
        newDivId.find("audio").attr("id", "a_" + connectionId);
        // console.log(`newDiv:${newDivId}`);
        // console.log('otheruserid: ', otherUserId);
        // console.log('connectionid: ', connectionId);
        newDivId.show();
        $('#divUsers').append(newDivId);
    }

    $(document).on('click', '.end-call-wrap', function () {
        $('.top-box-show').css({
            'display': 'block'
        }).html(` <div class="
        top-box align-vertical-middle profile-dialogue-show">
        <h1 class="mt-2">leave meeting</h1> 
        <div class="call-leave-cancel-action d-flex justify-content-center align-items-center w-100">
         <a href="/entry"> <button class="call-leave-action btn btn-danger mr-5">leave</button> </a> 
         <button class="call-cancel-action btn btn-secondary">cancel</button> </div> </div>`);
    });

    $(document).mouseup(function (e) {
        var container = new Array();
        container.push($('.top-box-show'));
        $.each(container, function (key, value) {
            if (!$(value).is(e.target) && $(value).has(e.target).length == 0) {
                $(value).empty();
            }
        });
    });

    $(document).on('click', '.call-cancel-action', function () {
        $('.top-box-show').html('');
    });

    return {
        _init: function (uid, mid) {
            init(uid, mid);
        }
    };
})();
