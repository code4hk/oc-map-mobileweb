import webapp2

from google.appengine.api import urlfetch


KMP_URL = 'http://www.google.com/maps/d/u/0/kml?mid=zIh97OmUhBNA.kGMqBtuPdCO4'


class MainPage(webapp2.RequestHandler):
    def get(self):
        self.response.headers['Access-Control-Allow-Origin'] = '*'
        self.response.headers['Content-Type'] = 'application/xml'

        try:
            response = urlfetch.fetch(KMP_URL)
        except urlfetch.Error:
            return self.error(404)

        self.response.out.write(response.content)

application = webapp2.WSGIApplication([
    ('/map.kml', MainPage),
], debug=True)
