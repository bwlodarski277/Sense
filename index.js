//Routes File

'use strict'

/* MODULE IMPORTS */
const Koa = require('koa')
const Router = require('koa-router')
const views = require('koa-views')
const staticDir = require('koa-static')
const bodyParser = require('koa-bodyparser')
const koaBody = require('koa-body')({multipart: true, uploadDir: '.'})
const session = require('koa-session')
const fs = require('fs-extra')

/* IMPORT CUSTOM MODULES */
const User = require('./modules/user')
const Song = require('./modules/song')
const UserSong = require('./modules/userSong')
const Playlists = require('./modules/playlists')
const UserPlaylist = require('./modules/User_playlists')
const PlaylistSongs = require('./modules/Playlist_songs')
const PlaylistComment = require('./modules/playlistComment')
const UserComment = require('./modules/userComment')
const Comment = require('./modules/comment')


const app = new Koa()
const router = new Router()

/* CONFIGURING THE MIDDLEWARE */
app.keys = ['darkSecret']
app.use(staticDir('public'))
app.use(bodyParser())
app.use(session(app))
app.use(views(`${__dirname}/views`, { extension: 'handlebars' }, {map: { handlebars: 'handlebars' }}))

const defaultPort = 8080
const port = process.env.PORT || defaultPort
const dbName = 'website.db'

/**
 * The secure home page.
 * @name Home Page
 * @route {GET} /
 * @authentication This route requires cookie-based authentication.
 */
router.get('/', async ctx => {
	try {
		const data = {}
		if(ctx.query.msg) data.msg = ctx.query.msg
		await ctx.render('homepage')
	} catch(err) {
		await ctx.render('error', {message: err.message})
	}
})

/**
 * The user registration page.
 * @name Register Page
 * @route {GET} /register
 */
router.get('/register', async ctx => await ctx.render('register'))

/**
 * The script to process new user registrations.
 * @name Register Script
 * @route {POST} /register
 */
router.post('/register', koaBody, async ctx => {
	try {
		const body = ctx.request.body
		console.log(`[register] body: ${body.user}`)
		const user = await new User(dbName)
		await user.register(body.user, body.pass)
		ctx.redirect(`/?msg=new user "${body.user}" added`)
	} catch(err) {
		await ctx.render('error', {message: err.message})
	}
})

/**
 * The user login page.
 * @name Login page
 * @route {GET} /login
 */
router.get('/login', async ctx => {
	const data = {}
	if(ctx.query.msg) data.msg = ctx.query.msg
	if(ctx.query.user) data.user = ctx.query.user
	await ctx.render('login', data)
})

/**
 * The script to process user logging in.
 * @name Login script
 * @route {POST} /login
 */
router.post('/login', async ctx => {
	try {
		const body = ctx.request.body
		const user = await new User(dbName)
		const id = await user.login(body.user, body.pass)
		ctx.session.authorised = true
		ctx.session.id = id
		return await ctx.redirect('/?msg=you are now logged in...')
	} catch(err) {
		await ctx.render('error', {message: err.message})
	}
})

/**
 * The songs page.
 * @name Songs page
 * @route {GET} /songs
 */
router.get('/songs', async ctx => {
	const song = await new Song(dbName)
	const data = await song.getAll()
	await ctx.render('songs', {songs: data})
})

/**
 * The playlists page.
 * @name Playlists page
 * @route {GET} /playlists
 */
router.get('/playlists', async ctx => {
	try {
		if(ctx.session.authorised === null) await ctx.redirect('/login?msg=you need to login')
		const data = {}
		if(ctx.query.msg) data.msg = ctx.query.msg
		await ctx.render('playlists')
	} catch(err) {
		await ctx.render('error', {message: err.message})
	}
})

/**
 * The script to process new playlist creations.
 * @name Playlist script
 * @route {POST} /playlists
 */
router.post('/playlists', koaBody, async ctx => {
	try{
		const body = ctx.request.body
		console.log(body)
		//creates new instance of class Playlist
		const playlist = await new Playlists(dbName)
		const playlistID = await playlist.create(body.name, body.description)
		//gets id of created playlist
		const userPlaylist = await new UserPlaylist(dbName)
		await userPlaylist.create(ctx.session.id, playlistID)
		//prints id of created playlist
		console.log(playlistID)
		//prints id of user who created the playlist
		console.log(ctx.session.id)
		await ctx.redirect(`/library/${playlistID}`)
		//ctx.redirect(`/playlists?msg=new playlist "${body.name}" created`)
	}catch(err) {
		console.log(err)
		await ctx.render('error', {message: err})
	}
})

// eslint-disable-next-line max-lines-per-function
router.get('/library/:id', async ctx => {
	try {
		// Getting all the necessary objects ready
		const playlist = await new Playlists(dbName)
		const playlistComment = await new PlaylistComment(dbName)
		const userComment = await new UserComment(dbName)
		const comment = await new Comment(dbName)
		// Getting the playlist details (name, description)
		const data = await playlist.get(ctx.params.id)
		// Getting the comment IDs for the playlist that's being viewed
		const commentIDs = await playlistComment.get(ctx.params.id)
		// Getting the comment details
		const comments = []
		for(const id of commentIDs) {
			const details = comment.get(id)
			const commentOwner = await userComment.getOwner(id)
			if(ctx.session.id === commentOwner) details.commentOwner = true
			await comments.push(details)
		}
		data.comments = comments
		data.id = ctx.params.id
		await ctx.render('library', data)
		//await ctx.render(`library/${ctx.params.id}`)
	} catch(err) {
		console.log(err)
		await ctx.render('error', err.message)
	}
})

router.get('/browse', async ctx => await ctx.render('browse'))

/**
 * The upload page.
 * @name Upload page
 * @route {GET} /upload
 */
router.get('/upload', async ctx => {
	if(ctx.session.authorised !== true) return ctx.redirect('/login?msg=you need to log in')
	//const data = []
	//if(ctx.query.msg) data.msg = ctx.query.msg
	//console.log(body.playlists)
	const userPlaylist = await new UserPlaylist(dbName)
	const playlists = await userPlaylist.getAllPlaylists(ctx.session.id)
	console.log(playlists)
	//const data = await playlist.get(playlists)
	//console.log(data)
	//data = data.playlists
	//console.log({userPlaylist: playlists})
	await ctx.render('upload', {playlists: playlists})
})

/**
 * The script that handles uploading music.
 * @name Upload script
 * @route {POST} /upload
 */
// eslint-disable-next-line max-lines-per-function
router.post('/upload', koaBody, async ctx => {
	try {
		const body = ctx.request.body
		const song = await new Song(dbName)
		const {path, type} = ctx.request.files.song
		if(body.Playlists === '0') {
			return await ctx.redirect('/upload?msg=You need to select a playlist')
		} else {
			const id = await song.add(await song.extractTags(path, type))
			console.log(`[upload] id: ${id}`)
			await fs.copySync(path, `public/music/${id}.mp3`)
			const userSong = await new UserSong(dbName)
			const playlistSong = await new PlaylistSongs(dbName)
			console.log(`[upload] ctx.session.id: ${ctx.session.id}`)
			//prints id of selected playlist, can be removed before submission
			console.log(body.Playlists)
			await userSong.link(ctx.session.id, id)
			await playlistSong.create(body.Playlists, id)
			await ctx.redirect(`/songs/${id}`)
		}
	} catch(err) {
		console.log(err)
		await ctx.render('upload', {msg: err.message})
	}
})

router.post('/comment', async ctx => {
	if(ctx.session.authorised === undefined) await ctx.redirect()
	const body = ctx.request.body
	const id = body.id
	if(body.comment.length === 0) {
		await ctx.redirect(`/library/${id}?msg=please type a comment`)
	}
	const playlistID = ctx.params.id, userID = ctx.session.id
	const comment = await new Comment(dbName)
	const userComment = await new UserComment(dbName)
	const playlistComment = await new PlaylistComment(dbName)
	const commentID = await comment.add(body.comment)
	await userComment.link(userID, commentID)
	await playlistComment.link(playlistID, commentID)
	await ctx.redirect(`/library/${id}`)
})

/**
 * The song details page.
 * @name Song details page
 * @route {GET} /upload/:id
 */
router.get('/songs/:id', async ctx => {
	try {
		const song = await new Song(dbName)
		const data = await song.get(ctx.params.id)
		const userSong = await new UserSong(dbName)
		const owner = await userSong.check(ctx.params.id)
		console.log(`[songs][${ctx.params.id}] owner: ${owner}`)
		if(owner === ctx.session.id) data.owner = true
		await ctx.render('play', data)
	} catch(err) {
		console.log(err)
		await ctx.render('error', err.message)
	}
})

/**
 * The song delete page.
 * @name Delete song page
 * @route {GET} /delete-song/:id
 */
router.get('/delete-song/:id', async ctx => {
	try {
		const userSong = await new UserSong(dbName)
		const user = ctx.session.id
		const owner = await userSong.check(ctx.params.id)
		if(user !== owner) return ctx.redirect('/login?msg=you are not the owner of this file')
		await userSong.remove(ctx.params.id)
		const song = await new Song(dbName)
		await song.delete(ctx.params.id)
		ctx.redirect('/?msg=song deleted!')
	} catch(err) {
		console.log(err)
		await ctx.render('err', err.message)
	}
})

/**
 * The upload page.
 * @name Logout page
 * @route {GET} /logout
 */
router.get('/logout', async ctx => {
	ctx.session.authorised = null
	ctx.session.id = null
	ctx.redirect('/?msg=you are now logged out')
})

app.use(router.routes())
module.exports = app.listen(port, async() => console.log(`listening on port ${port}`))
